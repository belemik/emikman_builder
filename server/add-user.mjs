import { addUser } from './auth.mjs';
const username = process.argv[2];
if (!username || !process.stdin.isTTY) { console.error('Используйте интерактивный Terminal: npm run user:add -- логин'); process.exit(1); }
process.stdout.write('Пароль (ввод скрыт, минимум 12 символов): ');
process.stdin.setRawMode(true); process.stdin.setEncoding('utf8'); process.stdin.resume();
let password = '';
process.stdin.on('data', async chunk => {
  for (const char of chunk) {
    if (char === '\u0003') { process.stdin.setRawMode(false); process.exit(130); }
    if (char === '\r' || char === '\n') {
      process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n');
      try { await addUser(username, password); console.log('Пользователь создан.'); } catch (error) { console.error(error.message); process.exitCode = 1; }
      password = ''; return;
    }
    if (char === '\u007f') password = password.slice(0, -1);
    else if (char >= ' ' && password.length < 129) password += char;
  }
});
