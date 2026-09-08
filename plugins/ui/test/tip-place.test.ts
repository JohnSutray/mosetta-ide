import { describe, expect, it } from 'vitest';
import { Tips, type TipSpot } from '@ide/windows';

const VIEW = { width: 800, height: 600 };
const TIP = { width: 200, height: 40 };

function spot(x: number, bottom: number, top = bottom - 30): TipSpot {
  return { x, y: bottom, above: top, title: 'подсказка', keys: [] };
}

describe('место подсказки', () => {
  const tips = new Tips();

  it('обычный случай: там, где просили', () => {
    expect(tips.place(spot(100, 200), TIP, VIEW)).toEqual({ left: 100, top: 200 });
  });

  it('у правого края — сдвигается влево, а не сжимается', () => {
    expect(tips.place(spot(780, 200), TIP, VIEW).left).toBe(592);
  });

  it('у левого края и в узком окне — не липнет к краю', () => {
    expect(tips.place(spot(-40, 200), TIP, VIEW).left).toBe(8);
    expect(tips.place(spot(10, 200), TIP, { width: 120, height: 600 }).left).toBe(8);
  });

  it('снизу не влезло — встаёт НАД элементом', () => {
    expect(tips.place(spot(100, 580, 550), TIP, VIEW).top).toBe(510);
  });

  it('не влезло ни снизу, ни сверху — прижимается к верху окна', () => {
    expect(tips.place(spot(100, 595, 20), TIP, VIEW).top).toBe(8);
  });

  it('окно ещё не измерено — оставляем как просили, а не жмём в угол', () => {
    expect(tips.place(spot(100, 200), TIP, { width: 0, height: 0 })).toEqual({ left: 100, top: 200 });
  });
});
