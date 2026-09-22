/* Game cards — append one entry here to add a game.

   Two kinds of entries:
     * external    games/external/** — third-party builds captured by index.mjs.
                   Their sources are never edited; they are copied verbatim into
                   dist/ and referenced by URL.
     * in-repo     games/operator-sorter, games/spot-the-difference — our own
                   sources, bundled by Vite, libraries pulled from npm.
                   Their thumbnails are imported so Vite emits them. */

import sorterThumb from "../games/operator-sorter/capture.png";
import spotThumb from "../games/spot-the-difference/capture.png";
import memoryThumb from "../games/memory/capture.png";
import orderThumb from "../games/order/capture.png";
import robotThumb from "../games/robot/capture.png";
import typingThumb from "../games/typing/capture.png";
import traceThumb from "../games/trace/capture.png";

const GAMES = [
  {
    name: "Bauhaus Builder",
    desc: "Physics-based machine building puzzle in Bauhaus style",
    url: "./games/external/bauhaus-builder/html/17195755-1681053/index.html",
    thumb: "./games/external/bauhaus-builder/capture.png",
    tag: "Phaser",
  },
  {
    name: "Robo Dance",
    desc: "Robot dancing game",
    url: "./games/external/robo-dance/html/17296427/GamedevJS2026_1.255_release_html/index.html",
    thumb: "./games/external/robo-dance/capture.png",
    tag: "Defold",
  },
  {
    name: "Kobots",
    desc: "Puzzle game about looting treasure with robots",
    url: "./games/external/kobots/html/17291460-1664183/index.html",
    thumb: "./games/external/kobots/capture.png",
    tag: "Phaser",
  },
  {
    name: "Block Alive",
    desc: "Blocky survival arcade game",
    url: "./games/external/block-alive/html/17523875/index.html",
    thumb: "./games/external/block-alive/capture.png",
    tag: "Unity",
  },
  {
    name: "Deus Ex Machina",
    desc: "Pixel-art mechanical puzzle platformer",
    url: "./games/external/deus-ex-machina/html/17305997-1930990/index.html",
    thumb: "./games/external/deus-ex-machina/capture.png",
    tag: "Phaser",
  },
  {
    name: "It Was The Robots",
    desc: "Pixel-art narrative game about robots",
    url: "./games/external/it-was-the-robots/html/17285611/index.html",
    thumb: "./games/external/it-was-the-robots/capture.png",
    tag: "Phaser",
  },
  {
    name: "Crew of One",
    desc: "Solo co-op puzzle game: crack one room at a time",
    url: "./games/external/crew-of-one/html/crew-of-one/3/index.html",
    thumb: "./games/external/crew-of-one/capture.png",
    tag: "Canvas 2D",
  },
  {
    name: "Python Operators",
    desc: "Sort parcels by type — 10 levels, 3 decks",
    url: "./games/operator-sorter/html/index.html",
    thumb: sorterThumb,
    tag: "Phaser",
  },
  {
    name: "Python Syntax Spot",
    desc: "Spot the changed spots in Python code — 10 levels on variables, operators, if/elif/else, indentation and colons",
    url: "./games/spot-the-difference/",
    thumb: spotThumb,
    tag: "HTML5",
  },
  {
    name: "Term Memory",
    desc: "Flip two cards and match each Python term with what it means — 8 levels",
    url: "./games/memory/",
    thumb: memoryThumb,
    tag: "HTML5",
  },
  {
    name: "Program Assembly",
    desc: "Put shuffled lines back in the order that makes the program print the target output — 8 levels",
    url: "./games/order/",
    thumb: orderThumb,
    tag: "HTML5",
  },
  {
    name: "Robot Orders",
    desc: "Program a robot with five instructions and deliver every parcel — 8 levels",
    url: "./games/robot/",
    thumb: robotThumb,
    tag: "HTML5",
  },
  {
    name: "Python Code Typing",
    desc: "Type each Python line exactly as written, punctuation and all — 10 timed levels, one wrong key costs a second",
    url: "./games/typing/",
    thumb: typingThumb,
    tag: "HTML5",
  },
  {
    name: "Python Variable Trace",
    desc: "Be the interpreter: predict what each variable holds after every line runs — 8 levels, the trace table fills itself as you get them right",
    url: "./games/trace/",
    thumb: traceThumb,
    tag: "HTML5",
  },
];

const grid = document.getElementById("grid");

if (!GAMES.length) {
  grid.innerHTML = '<div class="empty">No games yet</div>';
} else {
  grid.innerHTML = GAMES.map((g) => `
    <a class="card" href="${g.url}">
      <div class="thumb">
        ${g.thumb ? `<img src="${g.thumb}" alt="${g.name}" loading="lazy">` : ''}
        ${g.tag ? `<span class="badge">${g.tag}</span>` : ''}
      </div>
      <div class="meta">
        <div class="name">${g.name}</div>
        <div class="desc">${g.desc}</div>
      </div>
    </a>
  `).join('');
}
