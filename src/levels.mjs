const range = (a, b) => {
  const out = [];
  const s = a <= b ? 1 : -1;
  for (let i = a; s > 0 ? i <= b : i >= b; i += s) out.push(i);
  return out;
};
const pingpong = (a, b) => [...range(a, b), ...range(b, a).slice(1, -1)];
const nulls = (n) => Array(n).fill(null);

function rowBeam({ ys, width, holes = [], step, name, tip }) {
  const shape = range(0, width - 1).filter((x) => !holes.includes(x)).map((x) => [x, 0]);
  return { type: "mover", shape, path: ys.map((y) => (y === null ? null : [0, y])), step, name, tip };
}

function colBeam({ xs, height, holes = [], step, name, tip }) {
  const shape = range(0, height - 1).filter((y) => !holes.includes(y)).map((y) => [0, y]);
  return { type: "mover", shape, path: xs.map((x) => (x === null ? null : [x, 0])), step, name, tip };
}

function checker({ w, h, block = 2, parity }) {
  const cells = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if ((Math.floor(x / block) + Math.floor(y / block)) % 2 === parity) cells.push([x, y]);
  return cells;
}

export const LEVELS = [
  {
    id: 1,
    name: "點亮第一步",
    zone: "入門區",
    goal: "走過藍色菱形格收集能量，出口開啟後走進去。",
    intro: "這一關沒有危險，先熟習移動。",
    newThing: "移動、收集、出口",
    time: 45,
    starTime: 13,
    map: [
      "P.....",
      "...E..",
      ".E....",
      "....E.",
      "..E...",
      ".....X",
    ],
    hazards: [],
  },
  {
    id: 2,
    name: "紅格別碰",
    zone: "入門區",
    goal: "紅色交叉紋格一直危險，找安全路線繞過去。",
    intro: "踩到紅格會扣一格生命。",
    newThing: "固定紅格",
    time: 45,
    starTime: 15,
    map: [
      "P.R.E.",
      "..R...",
      "E.R.R.",
      "....R.",
      ".RRER.",
      "E....X",
    ],
    hazards: [],
  },
  {
    id: 3,
    name: "燈亮之前",
    zone: "入門區",
    goal: "中間一列會先亮琥珀色斜紋，之後變紅。趁熄滅時穿過。",
    intro: "琥珀色＝即將變紅。看準它熄滅的時機。",
    newThing: "預警格",
    time: 45,
    starTime: 14,
    map: [
      "P.....",
      ".E....",
      "......",
      ".E...E",
      "....E.",
      ".....X",
    ],
    hazards: [
      { type: "pulse", cells: range(0, 5).map((y) => [3, y]), period: 5, warn: 1.6, on: 1.8, offset: 1.6, name: "閃動光牆", tip: "琥珀色亮起時先停下，等紅色熄滅才穿過。" },
    ],
  },
  {
    id: 4,
    name: "光束巡邏",
    zone: "巡邏區",
    goal: "紅色光束左右巡邏，中間兩格是缺口。利用缺口或衝刺穿過。",
    intro: "新技能：衝刺！向前衝兩格，冷卻三秒，沒有無敵效果。",
    newThing: "移動光束、衝刺",
    dash: true,
    time: 50,
    starTime: 20,
    map: [
      "P......S",
      ".E....E.",
      "........",
      "........",
      "........",
      "........",
      ".E....E.",
      "S......X",
    ],
    hazards: [
      colBeam({ xs: pingpong(1, 6), height: 8, holes: [3, 4], step: 1.0, name: "巡邏光束", tip: "光束中間兩格是缺口，站在缺口那兩行就能讓光束掃過。" }),
    ],
  },
  {
    id: 5,
    name: "紅潮走廊",
    zone: "巡邏區",
    goal: "紅潮一排排向上推進。跟在紅潮後方前進，下一波來時躲到綠色安全格。",
    intro: "綠色盾牌格永遠安全，可以停下來觀察。",
    newThing: "逐列紅潮、安全格",
    dash: true,
    time: 60,
    starTime: 26,
    map: [
      "S...#..X",
      ".E..#.E.",
      "......S.",
      ".S......",
      "...E..#.",
      "#....S..",
      ".E...E..",
      "P....##S",
    ],
    hazards: [
      rowBeam({ ys: [...range(7, 0), ...nulls(3)], width: 8, step: 0.9, name: "橫向紅潮", tip: "琥珀色斜紋是下一排危險位置；紅潮經過時站在綠格上。" }),
    ],
  },
  {
    id: 6,
    name: "十字交錯",
    zone: "巡邏區",
    goal: "橫線掃完換直線掃，兩者輪流出現。看清下一條線從哪裏來。",
    intro: "橫線向下、直線向右，輪流掃過整個房間。",
    newThing: "橫直交替",
    dash: true,
    time: 60,
    starTime: 22,
    map: [
      "P......E",
      "...S....",
      "..S..E..",
      ".E......",
      "......S.",
      "..E..S..",
      ".....E..",
      "S..S...X",
    ],
    hazards: [
      rowBeam({ ys: [...range(0, 7), ...nulls(8)], width: 8, step: 0.9, name: "橫向掃線", tip: "橫線向下掃時，跑到它上方剛熄滅的位置。" }),
      colBeam({ xs: [...nulls(8), ...range(0, 7)], height: 8, step: 0.9, name: "直向掃線", tip: "直線向右掃時，跑到它左方剛熄滅的位置。" }),
    ],
  },
  {
    id: 7,
    name: "記憶光路",
    zone: "記憶區",
    goal: "能量位置只顯示幾秒，之後隱藏，偶爾閃出微光。記住位置！",
    intro: "倒數期間和開始後五秒會顯示能量位置。",
    newThing: "隱藏能量",
    dash: true,
    time: 60,
    starTime: 22,
    memory: { reveal: 5 },
    map: [
      "P.......",
      "...E....",
      ".E....E.",
      "........",
      "....S...",
      ".E......",
      "......E.",
      "...E...X",
    ],
    hazards: [
      { type: "pulse", cells: range(0, 7).map((x) => [x, 3]), period: 6, warn: 1.5, on: 2, name: "橫向光牆", tip: "光牆週期固定，熄滅後有約兩秒可穿過。" },
      { type: "pulse", cells: range(0, 7).map((y) => [4, y]), period: 6, warn: 1.5, on: 2, offset: 3, name: "直向光牆", tip: "兩道光牆輪流亮起，等一道熄滅再穿過。" },
    ],
  },
  {
    id: 8,
    name: "節奏方陣",
    zone: "節奏區",
    goal: "兩組方塊按固定節拍輪流亮起。踩着節拍，從熄滅的方塊跳到另一組。",
    intro: "每組方塊：琥珀一拍、紅色一拍半、熄滅一拍半。",
    newThing: "節拍開關",
    dash: true,
    time: 90,
    starTime: 50,
    map: [
      "P...E...",
      "........",
      "..E.....",
      ".....E..",
      "........",
      ".E......",
      "......E.",
      "S......X",
    ],
    hazards: [
      { type: "pulse", cells: checker({ w: 8, h: 8, parity: 0 }), period: 4, warn: 1, on: 1.5, offset: 0, name: "節奏方塊甲", tip: "一組方塊熄滅時，另一組正在預警；在預警轉紅前離開。" },
      { type: "pulse", cells: checker({ w: 8, h: 8, parity: 1 }), period: 4, warn: 1, on: 1.5, offset: 2, name: "節奏方塊乙", tip: "跟着節拍走：甲組熄滅就跳到甲組，乙組熄滅就跳到乙組。" },
    ],
  },
  {
    id: 9,
    name: "旋轉警戒",
    zone: "節奏區",
    goal: "兩條紅臂繞着中央柱旋轉。在紅臂掃過前拿走能量，再躲到斜線以外的位置。",
    intro: "不在橫、直、斜八條線上的格子，紅臂永遠碰不到。",
    newThing: "旋轉紅臂",
    dash: true,
    time: 60,
    starTime: 27,
    map: [
      "P...E...S",
      ".........",
      "..E...E..",
      ".........",
      "E...#...E",
      ".........",
      "..E...E..",
      ".........",
      "S...E...X",
    ],
    hazards: [
      { type: "rotor", center: [4, 4], length: 4, arms: 2, step: 1.0, name: "旋轉紅臂", tip: "琥珀色顯示紅臂下一個位置；等它轉走後立即進入。" },
    ],
  },
  {
    id: 10,
    name: "雙重封鎖",
    zone: "核心區",
    goal: "紅潮向下推進，同時兩條光柱按節拍開關。兩種規律一起看。",
    intro: "先找綠格避紅潮，再看光柱節拍。",
    newThing: "紅潮＋節拍",
    dash: true,
    time: 60,
    starTime: 22,
    map: [
      "P..E....",
      "......S.",
      ".E......",
      "...S..E.",
      "S.......",
      "....E..S",
      ".E......",
      "...S...X",
    ],
    hazards: [
      rowBeam({ ys: [...range(0, 7), ...nulls(5)], width: 8, step: 0.9, name: "向下紅潮", tip: "紅潮經過時要站在綠格上，或跟在它上方。" }),
      { type: "pulse", cells: [...range(0, 7).map((y) => [2, y]), ...range(0, 7).map((y) => [5, y])], period: 4, warn: 1, on: 1.5, name: "節拍光柱", tip: "兩條光柱一起亮滅，熄滅時有一拍半可以穿過。" },
    ],
  },
  {
    id: 11,
    name: "能量接力",
    zone: "核心區",
    goal: "能量分三批出現，收完一批才會出現下一批。",
    intro: "每批位置不同，收完後留意新亮起的藍格。",
    newThing: "分批能量",
    dash: true,
    time: 75,
    starTime: 35,
    map: [
      "P..R..2.",
      ".E......",
      "...R.E..",
      "3.......",
      "....R..3",
      ".2......",
      "..E..R..",
      "S..2..3X",
    ],
    hazards: [
      colBeam({ xs: pingpong(0, 7), height: 8, holes: [2, 5], step: 0.9, name: "接力光束", tip: "光束在第三行和第六行有缺口，站在那兩行可讓它掃過。" }),
    ],
  },
  {
    id: 12,
    name: "核心突圍",
    zone: "核心區",
    goal: "三段挑戰：掃線、節奏、出口衝關。段與段之間有兩秒安全時間。",
    intro: "失敗時可以從當段重新開始。",
    newThing: "三段挑戰",
    dash: true,
    time: 120,
    starTime: 58,
    map: [
      "S..S...S",
      "........",
      "........",
      "...S....",
      "....S...",
      "........",
      "........",
      "P..S...X",
    ],
    stages: [
      {
        name: "第一段：掃線",
        energy: [[1, 1], [6, 2], [2, 5], [5, 6]],
        hazards: [rowBeam({ ys: [...range(7, 0), ...nulls(4)], width: 8, step: 0.85, name: "核心紅潮", tip: "紅潮來時站上綠格，等它過去再追上。" })],
      },
      {
        name: "第二段：節奏",
        energy: [[6, 0], [1, 3], [6, 5], [2, 7]],
        hazards: [
          { type: "pulse", cells: checker({ w: 8, h: 8, parity: 0 }), period: 4, warn: 1, on: 1.5, offset: 0, name: "核心節奏甲", tip: "踩着節拍在兩組方塊之間跳。" },
          { type: "pulse", cells: checker({ w: 8, h: 8, parity: 1 }), period: 4, warn: 1, on: 1.5, offset: 2, name: "核心節奏乙", tip: "踩着節拍在兩組方塊之間跳。" },
        ],
      },
      {
        name: "第三段：出口衝關",
        energy: [[1, 2], [6, 4], [3, 6]],
        hazards: [
          colBeam({ xs: pingpong(0, 7), height: 8, holes: [1, 6], step: 0.8, name: "出口光束", tip: "光束在第二行和第七行有缺口。" }),
          rowBeam({ ys: [...nulls(3), ...range(0, 7), ...nulls(3)], width: 8, holes: [0, 7], step: 0.9, name: "出口紅潮", tip: "紅潮兩側最外面的格子是缺口。" }),
        ],
      },
    ],
  },
];
