function greet(who) {
  const words = ['hello', who];
  const line = words.join(', ');
  document.getElementById('out').textContent = line;
  return line;
}
greet('browser');
