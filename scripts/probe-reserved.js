(() => {
  const seen = new Map();
  const name = (event) => {
    const parts = [];
    if (event.metaKey) parts.push('meta');
    if (event.ctrlKey) parts.push('control');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    parts.push(event.code.replace(/^Key|^Digit/, '').toLowerCase());
    return parts.join('+');
  };

  const handler = (event) => {
    if (!event.metaKey && !event.ctrlKey && !event.altKey) return;
    seen.set(name(event), { cancelable: event.cancelable, at: seen.size + 1 });
    event.preventDefault();
    event.stopPropagation();
  };

  window.addEventListener('keydown', handler, true);

  globalThis.ide = globalThis.ide ?? {};
  globalThis.ide.probe = {
    report() {
      const rows = [...seen.entries()].map(([key, info]) => ({
        клавиша: key,
        'дошла до страницы': 'да',
        'гасится превентом': info.cancelable ? 'да' : 'НЕТ',
      }));
      console.table(rows);
      console.log(
        'Чего в таблице нет — до страницы не дошло: браузер обработал у себя.',
      );
      return rows.map((row) => row.клавиша);
    },
    stop() {
      window.removeEventListener('keydown', handler, true);
      console.log('слушатель снят');
    },
  };

  console.log('Жму клавиши, потом ide.probe.report(). Снять: ide.probe.stop()');
})();
