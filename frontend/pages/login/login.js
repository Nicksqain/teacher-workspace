const loginForm = document.querySelector('#login-form');
const loginStatus = document.querySelector('#login-status');

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const fields = new FormData(loginForm);
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  loginStatus.textContent = 'Вход';

  try {
    const response = await fetch('http://localhost:3000/auth/login', {
      method: 'POST',
      headers: {
        'Content-type': 'application/json',
      },
      body: JSON.stringify({
        email: fields.get('email'),
        password: fields.get('password'),
      }),
    });
    if (!response.ok) {
      throw new Error(
        response.status == 401
          ? 'Неверный email или пароль'
          : `Ошибка входа: ${response.status}`,
      );
    }

    const data = await response.json();

    if (typeof data.accessToken !== 'string' || !data.accessToken) {
      throw new Error('Сервер не вернул токен');
    }

    sessionStorage.setItem('accessToken', data.accessToken);
    loginForm.reset();
    loginStatus.textContent = 'Вход выполнен';

    window.location.href = '../schedule/index.html';
  } catch (error) {
    loginStatus.textContent =
      error instanceof Error ? error.message : 'Не удалось войти';
  } finally {
    button.disabled = false;
  }
});
