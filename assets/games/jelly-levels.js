/**
 * Sticky Jelly levels. Each level is ASCII rows (see parseLevel in jelly-engine.js) and its par, the length of a shortest
 * solution. Par is checked against the solver by tests/jelly.test.js, so a typo here fails the tests instead of a visitor.
 *   # wall   . floor   (space) outside   * ring   o i k jelly   O I K jelly already on a ring
 */
export const LEVELS = [
  {
    name: "Say hello",
    tip: "Swipe, or use the arrow keys. Slide the orange jelly onto the ring.",
    par: 6,
    rows: [
      "o....",
      ".###.",
      "....*",
    ],
  },
  {
    name: "Stick",
    tip: "Sleepy ivory jellies stick to you the moment you touch them. Stuck jellies move as one.",
    par: 4,
    rows: [
      " ...#",
      "..#i.",
      ".*..o",
      ".*...",
      " #.. ",
    ],
  },
  {
    name: "Slick",
    tip: "Ink never sticks. Get behind it and push.",
    par: 4,
    rows: [
      "*....",
      "*.#..",
      "ko#..",
      "...##",
      " ....",
    ],
  },
  {
    name: "Pair up",
    tip: "Two rings and two sleepers. Sometimes you are the glue.",
    par: 9,
    rows: [
      "i..# ",
      "..*..",
      ".o.*.",
      "#...#",
      "...i ",
    ],
  },
  {
    name: "Slippery",
    tip: "Not everything sticks. Work out what to glue and what to leave alone.",
    par: 8,
    rows: [
      " ...# ",
      ".i..k.",
      "....**",
      "...#..",
      ".o.##.",
      " .....",
    ],
  },
  {
    name: "Three of a kind",
    tip: "Three rings in an L. Collect the sleepers and bring the whole shape home.",
    par: 10,
    rows: [
      "###..",
      ".**.o",
      ".*...",
      "..#i.",
      ".i...",
      "i....",
    ],
  },
  {
    name: "Twins",
    tip: "Two orange jellies, one set of controls. Both slide every time.",
    par: 8,
    rows: [
      "....i",
      "..*.*",
      "...##",
      "...##",
      "#o..o",
      " ... ",
    ],
  },
  {
    name: "Crowded",
    tip: "Walls, ink and two of you. Think before you touch anything.",
    par: 11,
    rows: [
      ".i#k. ",
      "...#.o",
      "...**.",
      "i...#.",
      "..o*#.",
    ],
  },
  {
    name: "Squeeze",
    tip: "Everything sticks, so tight corners matter.",
    par: 11,
    rows: [
      " ..#. ",
      ".i....",
      "#.*...",
      "*..i.i",
      "*.o.#.",
      ".o... ",
    ],
  },
  {
    name: "Pile up",
    tip: "Three rings in a cluster. Sort out what sticks to what before you head for them.",
    par: 12,
    rows: [
      ".i..k#",
      "......",
      "......",
      "...#o.",
      "#.i.**",
      " i...*",
    ],
  },
  {
    name: "The knot",
    tip: "Four rings, four sleepers, one very slick neighbour.",
    par: 12,
    rows: [
      ".#*...",
      "iko..i",
      ".**...",
      "i.*...",
      ".....i",
      "#.#...",
    ],
  },
  {
    name: "Sticky situation",
    tip: "Two of you, three sleepers, one ink block. Take your time.",
    par: 16,
    rows: [
      " o.*.. ",
      "..i...#",
      ".o..##.",
      ".*..i..",
      " *...ki",
    ],
  },
];
