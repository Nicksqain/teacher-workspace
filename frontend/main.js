const button = document.querySelector('#check-button');
const status = document.querySelector('#status');

button.addEventListener('click', () => {
  status.textContent = 'JavaScript работает!';
});
