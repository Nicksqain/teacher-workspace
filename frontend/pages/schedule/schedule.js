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

async function loadSchedule() {
  const token = sessionStorage.getItem('accessToken');

  if (!token) {
    console.log('Нет токена - сначала нужен вход в систему.');
    return;
  }

  try {
    const response = await fetch('http://localhost:3000/schedule', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Ошибка запроса: ${response.status}`);
    }

    const lessons = await response.json();
    console.log('Расписание:', lessons);
  } catch (error) {
    console.error('Не удалось загрузить расписание:', error);
  }
}

loadSchedule();
