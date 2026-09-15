function add(items) {
  const box = { count: items.length, label: 'нота' };
  let sum = 0;
  for (const x of items) sum += x;
  console.log('sum', sum, box.label);
  return JSON.parse(JSON.stringify({ sum }));
}
add([1, 2, 3]);
