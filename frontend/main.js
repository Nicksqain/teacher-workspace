function highlightToday() {
  const table = document.querySelector('table');
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;

  table.querySelectorAll('.today').forEach((cell) => {
    cell.classList.remove('today');
  });

  const header = table.querySelector(`th[data-date="${today}"]`);

  if (!header) return;

  header.classList.add('today');

  table.querySelectorAll('tbody tr').forEach((row) => {
    row.cells[header.cellIndex]?.classList.add('today');
  });
}

highlightToday();

setInterval(highlightToday, 60_000);