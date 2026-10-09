
"use strict";

const $ = (id) => document.getElementById(id);

const machineNames = ["Machine 1", "Machine 2", "Machine 3"];
const productNames = ["Product A", "Product B", "Product C"];

let heatChart = null;
let capacityChart = null;

const sampleA = [
  [2, 1, 1],
  [1, 2, 1],
  [1, 1, 2]
];
const sampleB = [100, 80, 90];

function buildInputs() {
  $("inputRows").innerHTML = machineNames.map((machine, i) => `
    <tr>
      <th scope="row">${machine}</th>
      ${[0, 1, 2].map(j => `
        <td>
          <input type="number" min="0" step="any"
            id="a${i}${j}" value="${sampleA[i][j]}"
            aria-label="${machine}, ${productNames[j]} hours">
        </td>
      `).join("")}
      <td>
        <input type="number" min="0" step="any"
          id="b${i}" value="${sampleB[i]}"
          aria-label="${machine} available hours">
      </td>
    </tr>
  `).join("");
}

function readInputs() {
  const A = [];
  const b = [];

  for (let i = 0; i < 3; i++) {
    const row = [];

    for (let j = 0; j < 3; j++) {
      const element = $(`a${i}${j}`);
      const value = element.valueAsNumber;

      if (element.value.trim() === "" || !Number.isFinite(value) || value < 0) {
        throw new Error("Enter valid nonnegative numbers in all machine-hour fields.");
      }

      row.push(value);
    }

    const capacity = $(`b${i}`);
    const hours = capacity.valueAsNumber;

    if (capacity.value.trim() === "" ||
        !Number.isFinite(hours) || hours < 0) {
      throw new Error("Available hours must be valid nonnegative numbers.");
    }

    A.push(row);
    b.push(hours);
  }

  return { A, b };
}

// Reduce a matrix to reduced row-echelon form.
// Returns the reduced matrix and the pivot columns.
function rref(input) {
  const M = input.map(row => row.slice());
  const rows = M.length;
  const cols = M[0].length;
  const eps = 1e-9;
  const pivots = [];

  let pivotRow = 0;

  for (let col = 0; col < cols && pivotRow < rows; col++) {
    let best = pivotRow;

    for (let r = pivotRow + 1; r < rows; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[best][col])) {
        best = r;
      }
    }

    if (Math.abs(M[best][col]) < eps) continue;

    [M[pivotRow], M[best]] = [M[best], M[pivotRow]];

    const pivot = M[pivotRow][col];
    for (let c = 0; c < cols; c++) {
      M[pivotRow][c] /= pivot;
    }

    for (let r = 0; r < rows; r++) {
      if (r === pivotRow) continue;

      const factor = M[r][col];

      for (let c = 0; c < cols; c++) {
        M[r][c] -= factor * M[pivotRow][c];
      }
    }

    pivots.push(col);
    pivotRow++;
  }

  // Clean tiny floating-point residuals.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.abs(M[r][c]) < eps) M[r][c] = 0;
    }
  }

  return { M, pivots };
}

function rankOf(matrix) {
  return rref(matrix).pivots.length;
}

function formatNumber(value) {
  if (Math.abs(value) < 1e-8) return "0";
  return Number(value.toFixed(6)).toString();
}

function renderTable(headers, rows) {
  return `
    <table class="result-table">
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(row =>
        `<tr>${row.map(value => `<td>${value}</td>`).join("")}</tr>`
      ).join("")}</tbody>
    </table>`;
}

function showCharts(A, b, solution = null) {
  const ctx1 = $("heatChart").getContext("2d");
  const ctx2 = $("capacityChart").getContext("2d");

  if (heatChart) heatChart.destroy();
  if (capacityChart) capacityChart.destroy();

  // Matrix heatmap using a regular chart grid.
  heatChart = new Chart(ctx1, {
    type: "bar",
    data: {
      labels: productNames,
      datasets: machineNames.map((machine, i) => ({
        label: machine,
        data: A[i],
        backgroundColor: [
          "rgba(101,224,189,0.8)",
          "rgba(131,170,255,0.8)",
          "rgba(255,190,118,0.8)"
        ][i],
        borderRadius: 5
      }))
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: "Hours required per product unit" }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Hours per unit" } }
      }
    }
  });

  if (solution && solution.every(x => x >= -1e-8)) {
    const used = A.map(row =>
      row.reduce((sum, hours, j) => sum + hours * solution[j], 0)
    );

    capacityChart = new Chart(ctx2, {
      type: "bar",
      data: {
        labels: machineNames,
        datasets: [
          { label: "Available hours", data: b, backgroundColor: "#83aaff" },
          { label: "Required hours", data: used, backgroundColor: "#65e0bd" }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom" } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: "Hours" } }
        }
      }
    });

    $("chartNote").textContent =
      "Required hours are calculated from the displayed production solution.";
  } else {
    $("chartNote").textContent =
      "No unique nonnegative solution is available for a capacity-usage chart.";
  }
}

function calculate() {
  $("results").hidden = false;

  try {
    const { A, b } = readInputs();

    const augmented = A.map((row, i) => [...row, b[i]]);
    const rankA = rankOf(A);
    const rankAug = rankOf(augmented);
    const consistent = rankA === rankAug;

    $("rankA").textContent = rankA;
    $("rankAug").textContent = rankAug;
    $("consistency").textContent = consistent ? "Consistent" : "Inconsistent";

    const message = $("resultMessage");
    const production = $("productionResult");
    const interpretation = $("interpretation");

    let solutionForChart = null;

    if (!consistent) {
      message.innerHTML = `
        <div class="status error">
          <strong>No exact solution exists.</strong><br>
          rank(A) ≠ rank([A | b]). The supplied machine-hour
          equalities contradict one another.
        </div>`;

      production.innerHTML = "";

      interpretation.innerHTML = `
        <p>The equations are inconsistent, so no production quantities
        satisfy all equalities simultaneously.</p>
        <p>This does not, by itself, identify a physical bottleneck.
        Investigate the input hours and add actual demand and capacity
        constraints to diagnose an operational bottleneck.</p>`;
    } else {
      const reduced = rref(augmented).M;

      if (rankA === 3) {
        // Each unknown column has a pivot; read the solution
        // from the reduced augmented matrix.
        const solution = [0, 0, 0];

        const reducedResult = rref(augmented);
        for (let r = 0; r < reducedResult.pivots.length; r++) {
          const pivotCol = reducedResult.pivots[r];

          if (pivotCol < 3) {
            solution[pivotCol] = reducedResult.M[r][3];
          }
        }

        solutionForChart = solution;

        const nonnegative = solution.every(x => x >= -1e-8);

        message.innerHTML = `
          <div class="status success">
            <strong>Unique mathematical solution found.</strong><br>
            rank(A) = rank([A | b]) = 3.
          </div>`;

        production.innerHTML = renderTable(
          ["Product", "Calculated quantity"],
          productNames.map((name, i) => [
            name,
            `${formatNumber(solution[i])} units`
          ])
        );

        const used = A.map(row =>
          row.reduce((sum, hours, j) => sum + hours * solution[j], 0)
        );

        production.innerHTML += renderTable(
          ["Machine", "Available hours", "Required hours", "Remaining hours"],
          machineNames.map((name, i) => [
            name,
            formatNumber(b[i]),
            formatNumber(used[i]),
            formatNumber(b[i] - used[i])
          ])
        );

        interpretation.innerHTML = nonnegative
          ? `<p>A unique nonnegative solution satisfies the exact equations.
             If whole products are required, additional integer constraints
             may be needed.</p>`
          : `<p>The equations have a unique solution, but at least one
             quantity is negative. Therefore, it is not a physically
             feasible production plan.</p>`;
      } else {
        message.innerHTML = `
          <div class="status">
            <strong>Infinitely many mathematical solutions.</strong><br>
            The system is consistent, but the production quantities
            are not uniquely determined.
          </div>`;

        production.innerHTML = `
          <p>rank(A) = ${rankA}, which is smaller than the number of
          unknowns (3). Free parameters remain.</p>
          <div class="formula">${reduced.map(row =>
            row.map(formatNumber).join("  ")
          ).join("<br>")}</div>`;

        interpretation.innerHTML = `
          <p>Additional information, such as customer demand, nonnegative
          quantities or a production objective, is needed to select
          a feasible plan.</p>`;
      }
    }

    showCharts(A, b, solutionForChart);
  } catch (error) {
    $("rankA").textContent = "—";
    $("rankAug").textContent = "—";
    $("consistency").textContent = "Input error";
    $("resultMessage").innerHTML =
      `<div class="status error">${error.message}</div>`;
    $("productionResult").innerHTML = "";
    $("interpretation").innerHTML = "";
  }
}

$("calculateBtn").addEventListener("click", calculate);

$("sampleBtn").addEventListener("click", () => {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      $(`a${i}${j}`).value = sampleA[i][j];
    }
    $(`b${i}`).value = sampleB[i];
  }
  calculate();
});

buildInputs();
calculate();
