let ticks = 0;
const timer = setInterval(() => {
  ticks += 1;
  console.log('tick', ticks);
  if (ticks >= 200) clearInterval(timer);
}, 50);
