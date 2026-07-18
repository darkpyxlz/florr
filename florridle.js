/* ============================================================
   florr.idle — a florr.io adaptation
   ------------------------------------------------------------
   A single-mob "duel" adaptation of florr.io:
   - Petal stats (damage / health / reload) and mob stats are
     based on values documented on the florr.io community wiki
     (official-florrio.fandom.com), Common rarity, scaled x3
     per rarity tier like the real game.
   - Armor is flat damage reduction: hits dealing <= armor are
     fully negated (Bone). Bur applies a non-stacking armor
     debuff that can push armor below zero.
   - A petal that survives the mob's body damage keeps hitting
     every revolution without reloading (multi-hit).
   - Healing petals earn Points instead of HP (the flower can't
     die here); Points buy zone travel and shop buffs.
   ============================================================ */
"use strict";

/* ---------------- utilities ---------------- */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const chance = (p) => Math.random() < p;

function fmt(n) {
  if (n === Infinity) return "∞";
  if (n < 0) return "-" + fmt(-n);
  if (n < 1000) return (Math.round(n * 10) / 10).toString().replace(/\.0$/, "");
  const units = ["k", "M", "B", "T", "Qa", "Qi"];
  let u = -1;
  while (n >= 1000 && u < units.length - 1) { n /= 1000; u++; }
  return (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10) + units[u];
}
function fmtInt(n) { return n < 1000 ? Math.round(n).toString() : fmt(n); }

/* ---------------- rarities ---------------- */
const RARITIES = [
  { name: "Common",    color: "#7eef6d" },
  { name: "Unusual",   color: "#ffe65d" },
  { name: "Rare",      color: "#4d52e3" },
  { name: "Epic",      color: "#861fde" },
  { name: "Legendary", color: "#de1f1f" },
  { name: "Mythic",    color: "#1fdbde" },
  { name: "Ultra",     color: "#ff2b75" },
  { name: "Super",     color: "#2bffa3" },
];
const MAX_TIER = RARITIES.length - 1;
const T = (tier) => Math.pow(3, tier); // florr scaling: x3 per rarity

/* ---------------- petals ----------------
   dmg / hp base = Common values, scaled x3 per tier.
   reload stays constant across rarities (as in florr for most petals).
------------------------------------------- */
const PETALS = {
  basic:    { name: "Basic",    dmg: 10, hp: 10, reload: 2.5,  color: "#ffffff",
              desc: "A nice petal. Not too strong, but not too weak." },
  fast:     { name: "Fast",     dmg: 8,  hp: 5,  reload: 1.0,  color: "#feffc9",
              desc: "Weaker than most petals, but recharges very quickly." },
  twin:     { name: "Twin",     dmg: 8,  hp: 5,  reload: 1.0,  count: 2, color: "#ffffff",
              desc: "Why stop at one? Two is better." },
  triplet:  { name: "Triplet",  dmg: 8,  hp: 5,  reload: 1.0,  count: 3, color: "#ffffff",
              desc: "How about THREE?!" },
  heavy:    { name: "Heavy",    dmg: 20, hp: 20, reload: 10.0, color: "#aaaaaa",
              desc: "Denser than most petals. Very durable, but takes a long time to recharge." },
  stinger:  { name: "Stinger",  dmg: 100, hp: 1, reload: 10.0, color: "#333333",
              desc: "It really hurts, but it's so fragile." },
  rice:     { name: "Rice",     dmg: 5,  hp: 1,  reload: 0.04, color: "#ffffff",
              desc: "Spawns instantly, but it's not very strong." },
  rock:     { name: "Rock",     dmg: 10, hp: 45, reload: 8.0,  color: "#777777",
              desc: "Extremely durable, but takes a while to recharge." },
  bone:     { name: "Bone",     dmg: 10, hp: 25, reload: 4.5,  armor: 5, color: "#e3e0d2",
              desc: "Sturdy. Its armor fully blocks weak hits — mobs that can't out-damage it never break it." },
  bur:      { name: "Bur",      dmg: 5,  hp: 10, reload: 2.0,  armorReduce: 10, color: "#9c8352",
              desc: "Its spikes shred mob armor. The debuff doesn't stack, but can push armor below zero." },
  iris:     { name: "Iris",     dmg: 5,  hp: 5,  reload: 6.0,  poison: 60, color: "#c76bde",
              desc: "Very poisonous, but takes a while to do its work. Poison ignores armor and evasion." },
  rose:     { name: "Rose",     dmg: 0,  hp: 5,  reload: 3.5,  heal: 10, color: "#ff94c9",
              desc: "Its healing properties are amazing. Here, it earns you Points instead." },
  leaf:     { name: "Leaf",     dmg: 8,  hp: 10, reload: 1.0,  pointsPS: 1, color: "#39b54a",
              desc: "Gathers energy from the sun to passively earn you Points." },
  wing:     { name: "Wing",     dmg: 15, hp: 15, reload: 1.25, color: "#ffffff",
              desc: "It comes and goes." },
  salt:     { name: "Salt",     dmg: 10, hp: 10, reload: 2.5,  reflect: 0.25, color: "#f1f1f1",
              desc: "Reflects a portion of the mob's body damage back at it." },
  cactus:   { name: "Cactus",   dmg: 5,  hp: 15, reload: 1.0,  petalHpBuff: 0.10, color: "#2f9e44",
              desc: "Somehow makes your other petals tougher. +10% petal health per rarity step." },
  dandelion:{ name: "Dandelion",dmg: 5,  hp: 5,  reload: 2.0,  blockHeal: true, color: "#fcfcfc",
              desc: "Its spores block healing effects — mobs can't regenerate while this is equipped." },
  pollen:   { name: "Pollen",   dmg: 8,  hp: 5,  reload: 1.0,  poison: 10, color: "#ffe763",
              desc: "Leaves stinging dust on everything it touches." },
  honey:    { name: "Honey",    dmg: 5,  hp: 10, reload: 2.0,  mobDmgReduce: 0.15, color: "#ffb52b",
              desc: "Sticky! Slows the mob down, softening its body damage by 15%." },
  missile:  { name: "Missile",  dmg: 25, hp: 5,  reload: 2.5,  armorPierce: 0.5, color: "#222222",
              desc: "You can actually shoot this one. Pierces half of the mob's armor." },
  web:      { name: "Web",      dmg: 5,  hp: 5,  reload: 3.0,  hitRateBuff: 0.10, color: "#f5f5f5",
              desc: "Sticky strands tangle the mob — all petals land 10% more hits." },
  peas:     { name: "Peas",     dmg: 8,  hp: 5,  reload: 1.4,  count: 4, color: "#8ac04b",
              desc: "4 in 1 deal!" },
  grapes:   { name: "Grapes",   dmg: 6,  hp: 5,  reload: 2.0,  count: 4, poison: 10, color: "#b04bc0",
              desc: "Poisonous 4 in 1 deal!" },
  corn:     { name: "Corn",     dmg: 4,  hp: 200, reload: 10.0, color: "#ffe08a",
              desc: "Yum. An absurdly durable snack — it can tank hits all day." },
  sand:     { name: "Sand",     dmg: 4,  hp: 2,  reload: 1.0,  count: 4, color: "#e0c068",
              desc: "A swarm of tiny grains." },
  lightning:{ name: "Lightning", dmg: 12, hp: 1, reload: 2.5,  bypassEvasion: true, ignoreArmor: true, color: "#7de8ff",
              desc: "Zap! Arcs straight through armor, and evasive mobs can't dodge it." },
  fang:     { name: "Fang",     dmg: 10, hp: 10, reload: 2.0,  fangPoints: 0.15, color: "#4a4a58",
              desc: "Thirsty for blood. Converts 15% of the damage it deals into Points." },
  faster:   { name: "Faster",   dmg: 8,  hp: 5,  reload: 0.5,  rotBuff: 0.4, color: "#feffc9",
              desc: "It's so light it makes your other petals spin faster." },
  clover:   { name: "Clover",   dmg: 2,  hp: 5,  reload: 2.5,  luck: 0.08, color: "#52b788",
              desc: "So lucky! Better odds of higher-rarity drops and crafts." },
  magnet:   { name: "Magnet",   dmg: 2,  hp: 15, reload: 2.5,  extraDrop: 0.10, color: "#a83e3e",
              desc: "Attracts extra loot from fallen mobs." },
  egg:      { name: "Egg",      dmg: 1,  hp: 10, reload: 3.5,  minionDPS: 6, color: "#fff0b5",
              desc: "Something interesting might pop out of this. It fights for you." },
  starfish: { name: "Starfish", dmg: 3,  hp: 20, reload: 2.5,  pointsPS: 2, color: "#d1495b",
              desc: "Regenerates endlessly, trickling that vitality into Points." },
};
// Petal specials that scale with rarity multiplier T(tier):
//   dmg, hp, poison, heal, pointsPS, minionDPS, armor, armorReduce, fang output.
// Utility percentages (luck, reflect, buffs) scale gently: x(1 + 0.5*tier).
const UTIL_SCALE = (tier) => 1 + 0.5 * tier;

/* ---------------- mobs ----------------
   hp / dmg base = Common values (x3 per tier).
   armor: flat reduction. heal: hp/s self-regen. evasion: dodge chance.
   drops: [petalId, chance] rolled per kill.
------------------------------------------- */
const MOBS = {
  /* ---- Garden ---- */
  baby_ant:    { name: "Baby Ant", hp: 10, dmg: 10, xp: 1, skin: "ant", color: "#555149", size: 22,
                 desc: "Weak and defenseless. It means no harm.",
                 drops: [["fast",.44],["leaf",.26],["twin",.12],["rice",.005],["triplet",.0005]] },
  worker_ant:  { name: "Worker Ant", hp: 25, dmg: 10, xp: 2, skin: "ant", color: "#555149", size: 25,
                 desc: "It's just doing its job.",
                 drops: [["fast",.34],["leaf",.30],["twin",.14],["rice",.01],["corn",.02]] },
  soldier_ant: { name: "Soldier Ant", hp: 40, dmg: 10, xp: 4, skin: "ant", color: "#4a463f", size: 28,
                 desc: "Ready for battle.",
                 drops: [["twin",.20],["faster",.10],["bone",.08],["clover",.05],["triplet",.005]] },
  bee:         { name: "Bee", hp: 15, dmg: 50, xp: 3, skin: "bee", color: "#ffe763", size: 26,
                 desc: "It stings. Don't touch it.",
                 drops: [["fast",.13],["stinger",.08],["twin",.04],["honey",.01],["wing",.004]] },
  ladybug:     { name: "Ladybug", hp: 25, dmg: 10, xp: 2, skin: "bug", color: "#eb4034", size: 26,
                 desc: "Cute and harmless.",
                 drops: [["rose",.35],["fast",.20],["twin",.10],["wing",.005]] },
  hornet:      { name: "Hornet", hp: 40, dmg: 50, xp: 6, skin: "bee", color: "#ffd12b", size: 28,
                 desc: "These aren't quite as nice as the little bee.",
                 drops: [["missile",.12],["dandelion",.06],["faster",.02],["honey",.008]] },
  centipede:   { name: "Centipede", hp: 250, dmg: 10, xp: 10, skin: "centi", color: "#8ac04b", size: 30,
                 desc: "So many segments... it takes forever to chew through.",
                 drops: [["leaf",.30],["peas",.20],["sand",.10],["triplet",.01]] },
  spider:      { name: "Spider", hp: 25, dmg: 25, xp: 5, skin: "spider", color: "#4a4a4a", size: 24,
                 poisonTouch: 1.5,
                 desc: "Its venomous fangs chew through petals 50% faster.",
                 drops: [["web",.25],["iris",.15],["faster",.05],["sand",.10]] },
  rock_mob:    { name: "Rock", hp: 30, dmg: 10, xp: 3, skin: "rock", color: "#8d8d8d", size: 28, armor: 3,
                 desc: "It's just a rock. Its surface shrugs off weak hits.",
                 drops: [["rock",.40],["heavy",.15]] },
  queen_ant:   { name: "Queen Ant", hp: 300, dmg: 30, xp: 40, skin: "ant", color: "#3d3a34", size: 42,
                 armor: 2, boss: true,
                 desc: "The matriarch of the colony. Royal drops for whoever fells her.",
                 drops: [["egg",.6],["twin",.5],["bone",.4],["rock",.35],["triplet",.15]] },

  /* ---- Desert ---- */
  beetle:      { name: "Beetle", hp: 40, dmg: 35, xp: 5, skin: "bug", color: "#8f5db0", size: 28,
                 desc: "It's hungry, and flowers are its favourite snack.",
                 drops: [["iris",.09],["salt",.06],["egg",.02],["wing",.006],["triplet",.0003]] },
  fire_ant:    { name: "Fire Ant", hp: 40, dmg: 10, xp: 4, skin: "ant", color: "#b8442c", size: 26,
                 desc: "An ant, but spicy.",
                 drops: [["fast",.20],["bur",.10],["iris",.06],["salt",.05]] },
  cactus_mob:  { name: "Cactus", hp: 42, dmg: 35, xp: 4, skin: "rock", color: "#2f9e44", size: 30, passive: true,
                 desc: "Just a plant. It doesn't fight back — but touching it hurts.",
                 drops: [["cactus",.22],["sand",.18],["missile",.05]] },
  scorpion:    { name: "Scorpion", hp: 45, dmg: 25, xp: 7, skin: "spider", color: "#d1a23c", size: 28,
                 poisonTouch: 1.5,
                 desc: "Its venom eats through petals 50% faster.",
                 drops: [["iris",.25],["sand",.10],["dandelion",.05],["stinger",.03]] },
  sandstorm:   { name: "Sandstorm", hp: 60, dmg: 40, xp: 8, skin: "rock", color: "#d9bd7f", size: 32,
                 desc: "A furious whirl of dust and grit.",
                 drops: [["sand",.35],["faster",.06]] },
  desert_centipede: { name: "Desert Centipede", hp: 250, dmg: 10, xp: 12, skin: "centi", color: "#d9bd7f", size: 30,
                 desc: "It flees when hurt — long and cowardly.",
                 drops: [["peas",.25],["sand",.20],["corn",.05],["triplet",.015]] },
  desert_moth: { name: "Desert Moth", hp: 12, dmg: 5, xp: 2, skin: "moth", color: "#e8d3a8", size: 24,
                 desc: "Shy. It would really rather be left alone.",
                 drops: [["wing",.30],["dandelion",.10],["corn",.03]] },
  queen_fire_ant: { name: "Queen Fire Ant", hp: 600, dmg: 45, xp: 60, skin: "ant", color: "#8f2f1c", size: 44,
                 armor: 5, boss: true,
                 desc: "Her burning brood obeys only her.",
                 drops: [["egg",.6],["salt",.45],["stinger",.35],["corn",.3],["bur",.3]] },

  /* ---- Ocean ---- */
  sponge:      { name: "Sponge", hp: 100, dmg: 5, xp: 6, skin: "rock", color: "#e8c86e", size: 30, passive: true,
                 desc: "Soft, porous, and utterly unbothered.",
                 drops: [["leaf",.20],["web",.15],["starfish",.08]] },
  jellyfish:   { name: "Jellyfish", hp: 45, dmg: 20, xp: 8, skin: "jelly", color: "#bfe3f5", size: 28,
                 poisonTouch: 1.25,
                 desc: "Its stinging tendrils wear petals down 25% faster.",
                 drops: [["lightning",.15],["web",.10],["starfish",.04]] },
  shell_mob:   { name: "Shell", hp: 50, dmg: 25, xp: 8, skin: "rock", color: "#e8ddc8", size: 28, armor: 10,
                 desc: "A hard shell. Weak petals just bounce off.",
                 drops: [["rock",.20],["salt",.15],["bone",.10],["corn",.08]] },
  crab:        { name: "Crab", hp: 80, dmg: 30, xp: 10, skin: "crab", color: "#d1495b", size: 30, armor: 15,
                 desc: "Armored claws and a worse attitude. Bring a Bur.",
                 drops: [["rock",.25],["bur",.15],["heavy",.10],["bone",.08]] },
  starfish_mob:{ name: "Starfish", hp: 100, dmg: 25, xp: 12, skin: "star", color: "#d1495b", size: 30, heal: 8,
                 desc: "It regrows as fast as you can cut. Dandelion blocks its healing.",
                 drops: [["starfish",.20],["rose",.25],["dandelion",.10],["fang",.05]] },
  leech:       { name: "Leech", hp: 60, dmg: 20, xp: 10, skin: "centi", color: "#54306e", size: 26, heal: 5,
                 desc: "It drinks vitality to patch itself up.",
                 drops: [["fang",.18],["iris",.10],["rice",.02]] },
  bubble_mob:  { name: "Bubble", hp: 1, dmg: 1, xp: 1, skin: "jelly", color: "#e8f4fa", size: 20, passive: true,
                 desc: "Pop!",
                 drops: [["rice",.40],["clover",.08]] },
  king_crab:   { name: "Giant Crab", hp: 1000, dmg: 60, xp: 120, skin: "crab", color: "#a3243c", size: 46,
                 armor: 25, boss: true,
                 desc: "The tide-lord. Its shell laughs at anything dull.",
                 drops: [["heavy",.55],["bone",.5],["bur",.45],["fang",.35],["starfish",.3]] },

  /* ---- Jungle ---- */
  dark_ladybug:{ name: "Dark Ladybug", hp: 25, dmg: 10, xp: 6, skin: "bug", color: "#33262b", size: 26,
                 desc: "A ladybug that embraced the shadows.",
                 drops: [["rose",.30],["wing",.15],["triplet",.02]] },
  jungle_centipede: { name: "Jungle Centipede", hp: 300, dmg: 15, xp: 20, skin: "centi", color: "#2e6b3c", size: 32,
                 poisonTouch: 1.5,
                 desc: "Every segment drips venom.",
                 drops: [["peas",.30],["iris",.20],["grapes",.12],["triplet",.03]] },
  mantis:      { name: "Mantis", hp: 45, dmg: 40, xp: 12, skin: "bee", color: "#6fbf4e", size: 30,
                 desc: "It prays... for your petals' demise.",
                 drops: [["peas",.28],["grapes",.10],["wing",.10],["stinger",.05]] },
  wasp:        { name: "Wasp", hp: 35, dmg: 60, xp: 12, skin: "bee", color: "#2b2b2b", size: 28,
                 desc: "Pure spite with wings.",
                 drops: [["stinger",.15],["missile",.18],["dandelion",.10],["pollen",.10]] },
  moth:        { name: "Moth", hp: 12, dmg: 5, xp: 3, skin: "moth", color: "#d8cba8", size: 24,
                 desc: "It just wanted to see the light.",
                 drops: [["wing",.35],["pollen",.15],["magnet",.05],["corn",.05]] },
  termite:     { name: "Termite", hp: 40, dmg: 20, xp: 8, skin: "ant", color: "#c2a26a", size: 26,
                 desc: "It eats wood. You are not wood. Mostly.",
                 drops: [["rice",.10],["corn",.12],["bone",.10],["egg",.05]] },
  bush:        { name: "Bush", hp: 100, dmg: 10, xp: 8, skin: "rock", color: "#1e6b3c", size: 32, armor: 5, passive: true,
                 desc: "Dense foliage. Light hits rustle right off it.",
                 drops: [["leaf",.35],["clover",.12],["grapes",.08]] },
  giant_mantis:{ name: "Mantis Prime", hp: 1600, dmg: 80, xp: 200, skin: "bee", color: "#3f8f2f", size: 46,
                 armor: 10, boss: true,
                 desc: "Apex predator of the canopy.",
                 drops: [["grapes",.5],["peas",.5],["stinger",.4],["egg",.35],["pollen",.3]] },

  /* ---- Sewers ---- */
  fly:         { name: "Fly", hp: 20, dmg: 25, xp: 10, skin: "bee", color: "#5c5c66", size: 24, evasion: 0.9,
                 desc: "Dodges 90% of physical hits. Lightning and poison never miss.",
                 drops: [["wing",.25],["magnet",.10],["fang",.05]] },
  roach:       { name: "Roach", hp: 60, dmg: 35, xp: 15, skin: "bug", color: "#7a4a21", size: 28, armor: 8,
                 desc: "It has survived worse than you.",
                 drops: [["dandelion",.15],["bur",.15],["corn",.10],["lightning",.05]] },
  firefly:     { name: "Firefly", hp: 30, dmg: 25, xp: 12, skin: "bee", color: "#ffef7a", size: 26,
                 poisonTouch: 1.25,
                 desc: "Its shocking glow burns petals 25% faster.",
                 drops: [["lightning",.25],["faster",.10],["magnet",.08]] },
  sewer_spider:{ name: "Sewer Spider", hp: 45, dmg: 40, xp: 14, skin: "spider", color: "#3a3a44", size: 28,
                 poisonTouch: 1.5,
                 desc: "It grew fat down here in the dark.",
                 drops: [["web",.30],["iris",.20],["faster",.08],["grapes",.05]] },
  garbage:     { name: "Garbage", hp: 200, dmg: 0, xp: 15, skin: "rock", color: "#6b705c", size: 34,
                 armor: 10, passive: true,
                 desc: "A festering heap. Something buzzes inside.",
                 drops: [["magnet",.20],["corn",.15],["fang",.08],["egg",.05]] },
  roach_king:  { name: "Roach Supreme", hp: 3500, dmg: 100, xp: 400, skin: "bug", color: "#4d2e13", size: 48,
                 armor: 20, boss: true,
                 desc: "Undisputed monarch of the muck.",
                 drops: [["lightning",.5],["bur",.5],["corn",.45],["magnet",.4],["fang",.35]] },

  /* ---- Ant Hell ---- */
  baby_fire_ant:{ name: "Baby Fire Ant", hp: 10, dmg: 10, xp: 8, skin: "ant", color: "#c9502e", size: 22,
                 desc: "Aww. It's trying its best.",
                 drops: [["fast",.30],["bone",.10],["rice",.05]] },
  worker_fire_ant:{ name: "Worker Fire Ant", hp: 25, dmg: 10, xp: 10, skin: "ant", color: "#b8442c", size: 25,
                 desc: "Toils for the queen, forever.",
                 drops: [["bone",.15],["iris",.10],["corn",.10]] },
  soldier_fire_ant:{ name: "Soldier Fire Ant", hp: 40, dmg: 20, xp: 15, skin: "ant", color: "#a03a24", size: 28,
                 desc: "Bred for war in the deep tunnels.",
                 drops: [["bur",.20],["bone",.18],["stinger",.10],["egg",.06]] },
  hell_termite:{ name: "Termite", hp: 40, dmg: 20, xp: 12, skin: "ant", color: "#d1b280", size: 26,
                 desc: "The colony's rival, equally at home in hell.",
                 drops: [["corn",.20],["rice",.10],["egg",.08]] },
  ant_hole:    { name: "Ant Hole", hp: 250, dmg: 0, xp: 20, skin: "rock", color: "#6e4a2e", size: 34,
                 armor: 15, passive: true,
                 desc: "Crack it open for what's hidden inside.",
                 drops: [["egg",.15],["bone",.20],["rock",.15]] },
  termite_overmind:{ name: "Termite Overmind", hp: 6000, dmg: 120, xp: 700, skin: "ant", color: "#8f6a3a", size: 50,
                 armor: 25, boss: true,
                 desc: "The hive dreams as one, and it dreams of you.",
                 drops: [["egg",.6],["bone",.55],["stinger",.45],["triplet",.3],["corn",.4]] },

  /* ---- Factory (adaptation-flavoured roster) ---- */
  cog:         { name: "Cog", hp: 80, dmg: 40, xp: 25, skin: "mech", color: "#9a9a9a", size: 30, armor: 25,
                 desc: "A grinding gear of the old machine. Heavily armored.",
                 drops: [["faster",.20],["heavy",.15],["lightning",.10]] },
  battery:     { name: "Battery", hp: 60, dmg: 50, xp: 25, skin: "mech", color: "#3f9e5f", size: 28,
                 poisonTouch: 1.25,
                 desc: "Still holds a charge. Petals sizzle on contact.",
                 drops: [["lightning",.30],["magnet",.12],["missile",.10]] },
  bulb:        { name: "Bulb", hp: 40, dmg: 25, xp: 18, skin: "mech", color: "#ffe98a", size: 26,
                 desc: "It flickers with residual current.",
                 drops: [["lightning",.15],["faster",.12],["clover",.10],["starfish",.05]] },
  live_wire:   { name: "Live Wire", hp: 100, dmg: 35, xp: 25, skin: "mech", color: "#c94f2e", size: 28,
                 evasion: 0.3,
                 desc: "It whips unpredictably — hard to pin down.",
                 drops: [["lightning",.20],["web",.15],["bur",.12]] },
  scrap_pile:  { name: "Scrap Pile", hp: 300, dmg: 0, xp: 30, skin: "rock", color: "#7d7d7d", size: 34,
                 armor: 30, passive: true,
                 desc: "Treasure, if you can dent it.",
                 drops: [["magnet",.25],["heavy",.20],["bone",.15],["corn",.10]] },
  mecha_hornet:{ name: "Mecha Hornet", hp: 12000, dmg: 160, xp: 1500, skin: "mech", color: "#d8b02b", size: 50,
                 armor: 40, boss: true,
                 desc: "Someone rebuilt the hornet. Someone made it worse.",
                 drops: [["missile",.55],["lightning",.5],["heavy",.45],["magnet",.4],["egg",.35]] },

  /* ---- Hel ---- */
  hel_beetle:  { name: "Hel Beetle", hp: 120, dmg: 60, xp: 40, skin: "bug", color: "#963a3a", size: 30, armor: 15,
                 desc: "Forged in the furnace below.",
                 drops: [["salt",.20],["heavy",.15],["stinger",.12],["fang",.10]] },
  hel_wasp:    { name: "Hel Wasp", hp: 80, dmg: 80, xp: 40, skin: "bee", color: "#701f1f", size: 28,
                 desc: "Its sting echoes for eternity.",
                 drops: [["stinger",.25],["missile",.20],["dandelion",.12]] },
  hel_spider:  { name: "Hel Spider", hp: 60, dmg: 60, xp: 40, skin: "spider", color: "#521f2e", size: 28,
                 poisonTouch: 1.5, evasion: 0.3,
                 desc: "It skitters between shadows.",
                 drops: [["web",.20],["iris",.20],["grapes",.15],["faster",.10]] },
  hel_centipede:{ name: "Hel Centipede", hp: 500, dmg: 25, xp: 60, skin: "centi", color: "#7a2e2e", size: 34,
                 armor: 10,
                 desc: "Each segment holds a damned soul.",
                 drops: [["grapes",.20],["peas",.20],["corn",.10],["triplet",.08]] },
  gambler:     { name: "Gambler", hp: 66, dmg: 66, xp: 66, skin: "jelly", color: "#c4b13c", size: 28,
                 desc: "Wanna bet?",
                 drops: [["clover",.33],["magnet",.20],["fang",.15],["egg",.08]] },
  hel_overlord:{ name: "Overlord of Hel", hp: 25000, dmg: 250, xp: 5000, skin: "bug", color: "#4d0f0f", size: 54,
                 armor: 50, heal: 200, boss: true,
                 desc: "Ruler of the final furnace. It regenerates — bring a Dandelion.",
                 drops: [["stinger",.6],["egg",.55],["lightning",.5],["heavy",.5],["triplet",.45],["grapes",.4]] },
};

/* ---------------- zones ----------------
   rarityWeights index = tier. baseTier used for boss scaling.
------------------------------------------- */
const ZONES = [
  { id: "garden", name: "Garden", color: "#1ea761", dark: "#168452",
    cost: 0, lvl: 1,
    desc: "A peaceful meadow. Every flower's first home.",
    mobs: ["baby_ant","worker_ant","soldier_ant","bee","ladybug","hornet","centipede","spider","rock_mob"],
    boss: "queen_ant",
    rarityWeights: [55, 32, 11, 2, 0, 0, 0, 0] },
  { id: "desert", name: "Desert", color: "#d8c380", dark: "#b5a266",
    cost: 500, lvl: 5,
    desc: "Scorching sands hide tougher prey and better loot.",
    mobs: ["beetle","fire_ant","cactus_mob","scorpion","sandstorm","desert_centipede","desert_moth"],
    boss: "queen_fire_ant",
    rarityWeights: [10, 45, 32, 11, 2, 0, 0, 0] },
  { id: "ocean", name: "Ocean", color: "#6089c4", dark: "#4a6da3",
    cost: 2500, lvl: 10,
    desc: "Beneath the waves, shells and claws shrug off weak petals.",
    mobs: ["sponge","jellyfish","shell_mob","crab","starfish_mob","leech","bubble_mob"],
    boss: "king_crab",
    rarityWeights: [0, 15, 42, 30, 11, 2, 0, 0] },
  { id: "jungle", name: "Jungle", color: "#20803e", dark: "#175e2d",
    cost: 10000, lvl: 18,
    desc: "The canopy hums with venom and hungry mandibles.",
    mobs: ["dark_ladybug","jungle_centipede","mantis","wasp","moth","termite","bush"],
    boss: "giant_mantis",
    rarityWeights: [0, 5, 30, 40, 20, 5, 0, 0] },
  { id: "sewers", name: "Sewers", color: "#6b705c", dark: "#54584a",
    cost: 40000, lvl: 26,
    desc: "Something skitters in the pipes. Flies dodge, roaches endure.",
    mobs: ["fly","roach","firefly","sewer_spider","moth","garbage"],
    boss: "roach_king",
    rarityWeights: [0, 0, 15, 35, 33, 15, 2, 0] },
  { id: "ant_hell", name: "Ant Hell", color: "#a86440", dark: "#84492c",
    cost: 120000, lvl: 34,
    desc: "The deep nest. The colony does not forgive intruders.",
    mobs: ["baby_fire_ant","worker_fire_ant","soldier_fire_ant","hell_termite","ant_hole"],
    boss: "termite_overmind",
    rarityWeights: [0, 0, 5, 25, 40, 25, 5, 0] },
  { id: "factory", name: "Factory", color: "#7d7d7d", dark: "#5c5c5c",
    cost: 400000, lvl: 42,
    desc: "Rust, sparks, and armor plating everywhere. (Adaptation roster.)",
    mobs: ["cog","battery","bulb","live_wire","scrap_pile"],
    boss: "mecha_hornet",
    rarityWeights: [0, 0, 0, 10, 30, 40, 18, 2] },
  { id: "hel", name: "Hel", color: "#963a3a", dark: "#702b2b",
    cost: 1500000, lvl: 50,
    desc: "The final furnace. Only Super flowers thrive here.",
    mobs: ["hel_beetle","hel_wasp","hel_spider","hel_centipede","gambler"],
    boss: "hel_overlord",
    rarityWeights: [0, 0, 0, 0, 10, 40, 38, 12] },
];

/* ---------------- talents ---------------- */
const TALENTS = {
  rotation:  { name: "Petal Rotation", max: 5, lvl: 1, costs: [1,1,2,2,3], icon: "🌀",
               desc: "+0.6 rad/s petal rotation per rank (2.5 → 5.5 rad/s, like the real talent)." },
  scholar:   { name: "Scholar", max: 5, lvl: 1, costs: [1,1,1,2,2], icon: "📚",
               desc: "+10% XP from kills and absorbing per rank." },
  greed:     { name: "Greed", max: 5, lvl: 1, costs: [1,1,1,2,2], icon: "💰",
               desc: "+10% Points earned per rank." },
  loadout:   { name: "Loadout", max: 5, lvl: 8, costs: [2,3,4,5,6], icon: "🌸",
               desc: "+1 active petal slot per rank (5 → 10 slots)." },
  petal_hp:  { name: "Petal Health", max: 5, lvl: 8, costs: [1,1,2,2,3], icon: "🛡️",
               desc: "+10% petal health per rank — survive more hits, multi-hit more." },
  sharpness: { name: "Sharpness", max: 5, lvl: 8, costs: [1,2,2,3,3], icon: "🗡️",
               desc: "+8% petal damage per rank." },
  reload:    { name: "Quick Reload", max: 5, lvl: 18, costs: [2,2,2,3,3], icon: "⏱️",
               desc: "-6% petal reload time per rank." },
  fortune:   { name: "Fortune", max: 5, lvl: 18, costs: [2,2,2,3,3], icon: "🍀",
               desc: "+6% luck per rank (better drop rarity and craft odds)." },
  salvage:   { name: "Salvage", max: 5, lvl: 18, costs: [2,2,2,3,3], icon: "🧲",
               desc: "+8% chance of an extra drop per rank." },
  overclock: { name: "Overclock", max: 3, lvl: 30, costs: [4,5,6], icon: "⚡",
               desc: "+10% total DPS per rank." },
  nectar:    { name: "Nectar Mastery", max: 3, lvl: 30, costs: [4,5,6], icon: "🍯",
               desc: "+20% Points earned per rank." },
  boss_buster:{ name: "Boss Buster", max: 3, lvl: 30, costs: [4,5,6], icon: "👑",
               desc: "+12% damage against bosses per rank." },
};
const TALENT_ROWS = [
  { lvl: 1,  ids: ["rotation","scholar","greed"] },
  { lvl: 8,  ids: ["loadout","petal_hp","sharpness"] },
  { lvl: 18, ids: ["reload","fortune","salvage"] },
  { lvl: 30, ids: ["overclock","nectar","boss_buster"] },
];

/* ---------------- crafting odds (florr-style 5 → 1) ---------------- */
const CRAFT_CHANCE = [0.64, 0.32, 0.16, 0.08, 0.04, 0.02, 0.01]; // tier -> tier+1

/* ---------------- achievements ---------------- */
const ACHIEVEMENTS = [
  { id:"first_blood", icon:"🩸", name:"First Blood", desc:"Defeat your first mob.", pts:50,
    check:(s)=>s.stats.kills>=1 },
  { id:"pest_100", icon:"🐜", name:"Pest Control", desc:"Defeat 100 mobs.", pts:200,
    check:(s)=>s.stats.kills>=100 },
  { id:"pest_1000", icon:"💀", name:"Exterminator", desc:"Defeat 1,000 mobs.", pts:500, tp:1,
    check:(s)=>s.stats.kills>=1000 },
  { id:"pest_10000", icon:"🌋", name:"Force of Nature", desc:"Defeat 10,000 mobs.", pts:2000, tp:3,
    check:(s)=>s.stats.kills>=10000 },
  { id:"boss_1", icon:"👑", name:"Regicide", desc:"Defeat your first boss.", pts:300,
    check:(s)=>s.stats.bossKills>=1 },
  { id:"boss_25", icon:"⚔️", name:"Boss Hunter", desc:"Defeat 25 bosses.", pts:1000, tp:2,
    check:(s)=>s.stats.bossKills>=25 },
  { id:"travel_1", icon:"🧭", name:"Wanderlust", desc:"Unlock a second zone.", pts:150,
    check:(s)=>s.unlockedZones.length>=2 },
  { id:"travel_all", icon:"🗺️", name:"Globetrotter", desc:"Unlock every zone.", pts:5000, tp:5,
    check:(s)=>s.unlockedZones.length>=ZONES.length },
  { id:"craft_1", icon:"⚗️", name:"Alchemist", desc:"Succeed at your first craft.", pts:100,
    check:(s)=>s.stats.crafts>=1 },
  { id:"craft_50", icon:"🔮", name:"Master Crafter", desc:"Succeed at 50 crafts.", pts:800, tp:2,
    check:(s)=>s.stats.crafts>=50 },
  { id:"mythic", icon:"💎", name:"Mythical", desc:"Obtain a Mythic or better petal.", pts:1000,
    check:(s)=>s.stats.bestTier>=5 },
  { id:"super", icon:"🌟", name:"Supreme", desc:"Obtain a Super petal.", pts:5000, tp:5,
    check:(s)=>s.stats.bestTier>=7 },
  { id:"absorb_50", icon:"💠", name:"Recycler", desc:"Absorb 50 petals.", pts:300,
    check:(s)=>s.stats.absorbed>=50 },
  { id:"lvl_10", icon:"🌱", name:"Sprout", desc:"Reach level 10.", pts:200,
    check:(s)=>s.level>=10 },
  { id:"lvl_25", icon:"🌷", name:"Bloom", desc:"Reach level 25.", pts:800, tp:2,
    check:(s)=>s.level>=25 },
  { id:"lvl_50", icon:"🌳", name:"Yggdrasil", desc:"Reach level 50.", pts:3000, tp:5,
    check:(s)=>s.level>=50 },
  { id:"dps_1k", icon:"🔥", name:"Lawnmower", desc:"Reach 1,000 DPS.", pts:200,
    check:(s)=>s.stats.bestDPS>=1000 },
  { id:"dps_100k", icon:"☄️", name:"Harvester", desc:"Reach 100k DPS.", pts:1000, tp:1,
    check:(s)=>s.stats.bestDPS>=100000 },
  { id:"dps_10m", icon:"🌠", name:"Star Eater", desc:"Reach 10M DPS.", pts:5000, tp:3,
    check:(s)=>s.stats.bestDPS>=10000000 },
  { id:"slots_10", icon:"🌼", name:"Full Bloom", desc:"Unlock all 10 active petal slots.", pts:2000,
    check:(s)=>maxSlots()>=10 },
  { id:"healer", icon:"💗", name:"Field Medic", desc:"Earn 10,000 Points from healing petals.", pts:500,
    check:(s)=>s.stats.healPoints>=10000 },
  { id:"gallery_10", icon:"📖", name:"Naturalist", desc:"Discover 10 mob species.", pts:200,
    check:(s)=>Object.keys(s.gallery).length>=10 },
  { id:"gallery_all", icon:"🏛️", name:"Grand Curator", desc:"Discover every mob species.", pts:3000, tp:3,
    check:(s)=>Object.keys(s.gallery).length>=Object.keys(MOBS).length },
  { id:"armor_break", icon:"🪓", name:"Can Opener", desc:"Kill an armored mob with a Bur equipped.", pts:150,
    check:()=>false /* triggered manually */ },
  { id:"no_heal", icon:"🚫", name:"No Refunds", desc:"Kill a regenerating mob with a Dandelion equipped.", pts:150,
    check:()=>false /* triggered manually */ },
];

/* ============================================================
   STATE
   ============================================================ */
const SAVE_KEY = "florrIdleSave_v1";

function freshState() {
  return {
    level: 1, xp: 0, tp: 0, points: 0,
    inventory: {},                  // "petalId:tier" -> count
    active: Array(10).fill(null),   // {id, tier} | null
    reserve: Array(10).fill(null),
    talents: {},                    // id -> rank
    unlockedZones: ["garden"],
    zone: "garden",
    killsInZone: 0,
    bossEvery: 15,
    gallery: {},                    // mobId -> { kills, byTier: {tier: n}, bestTier }
    achievements: {},               // id -> true
    stats: { kills: 0, bossKills: 0, crafts: 0, craftFails: 0, absorbed: 0,
             bestDPS: 0, bestTier: 0, healPoints: 0, playtime: 0,
             petalsFound: 0, xpEarned: 0, pointsEarned: 0 },
  };
}
let S = freshState();

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage full/blocked */ }
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    S = Object.assign(freshState(), data);
    S.stats = Object.assign(freshState().stats, data.stats || {});
    return true;
  } catch (e) { return false; }
}

/* transient (not saved) */
let mob = null;            // current mob instance
let isBoss = false;
let buffs = {};            // id -> expiry timestamp (ms)
let selectedSlot = null;   // {row: 'active'|'reserve', idx}
let dpsBreakdown = [];     // for tooltip / cosmetics
let currentDPS = 0, currentPPS = 0;
let floaters = [];         // damage numbers on canvas
let dmgAccum = 0;          // accumulated damage since last floater
let panelOpen = null;
let stallTimer = 0;
let zeroDpsTimer = 0; // time spent unable to scratch the current mob

/* ============================================================
   INVENTORY HELPERS
   ============================================================ */
const invKey = (id, tier) => id + ":" + tier;
function addPetal(id, tier, n = 1) {
  const k = invKey(id, tier);
  S.inventory[k] = (S.inventory[k] || 0) + n;
  S.stats.petalsFound += n;
  if (tier > S.stats.bestTier) S.stats.bestTier = tier;
}
function removePetal(id, tier, n = 1) {
  const k = invKey(id, tier);
  if ((S.inventory[k] || 0) < n) return false;
  S.inventory[k] -= n;
  if (S.inventory[k] <= 0) delete S.inventory[k];
  return true;
}
function invEntries() {
  return Object.entries(S.inventory)
    .map(([k, count]) => {
      const [id, tier] = k.split(":");
      return { id, tier: +tier, count };
    })
    .sort((a, b) => b.tier - a.tier || a.id.localeCompare(b.id));
}
function maxSlots() { return 5 + (S.talents.loadout || 0); }
function equippedPetals() {
  return S.active.slice(0, maxSlots()).filter(Boolean);
}

/* ============================================================
   DERIVED PLAYER STATS
   ============================================================ */
function talentRank(id) { return S.talents[id] || 0; }
function buffActive(id) { return (buffs[id] || 0) > Date.now(); }

function playerMods() {
  const eq = equippedPetals();
  let rot = 2.5 + 0.6 * talentRank("rotation");
  let petalHpMult = 1 + 0.10 * talentRank("petal_hp");
  let dmgMult = 1 + 0.08 * talentRank("sharpness");
  let reloadMult = Math.max(0.5, 1 - 0.06 * talentRank("reload"));
  let luck = 0.06 * talentRank("fortune");
  let extraDrop = 0.08 * talentRank("salvage");
  let ptsMult = (1 + 0.10 * talentRank("greed")) * (1 + 0.20 * talentRank("nectar"));
  let xpMult = 1 + 0.10 * talentRank("scholar");
  let dpsMult = 1 + 0.10 * talentRank("overclock");
  let bossMult = 1 + 0.12 * talentRank("boss_buster");
  let hitRate = 1, mobDmgReduce = 0, burReduce = 0, blockHeal = false;

  for (const p of eq) {
    const base = PETALS[p.id], u = UTIL_SCALE(p.tier);
    if (base.rotBuff) rot += base.rotBuff * u;
    if (base.petalHpBuff) petalHpMult += base.petalHpBuff * u;
    if (base.hitRateBuff) hitRate += base.hitRateBuff * u;
    if (base.mobDmgReduce) mobDmgReduce = Math.max(mobDmgReduce, Math.min(0.6, base.mobDmgReduce * u));
    if (base.luck) luck += base.luck * u;
    if (base.extraDrop) extraDrop += base.extraDrop * u;
    if (base.armorReduce) burReduce = Math.max(burReduce, base.armorReduce * T(p.tier)); // non-stacking, like florr's Bur
    if (base.blockHeal) blockHeal = true;
  }
  if (buffActive("rush")) dpsMult *= 1.5;
  if (buffActive("lucky")) luck += 0.25;
  if (buffActive("focus")) ptsMult *= 1.5;
  rot = Math.min(rot, 12);
  return { rot, petalHpMult, dmgMult, reloadMult, luck, extraDrop, ptsMult, xpMult, dpsMult, bossMult,
           hitRate, mobDmgReduce, burReduce, blockHeal };
}

/* ============================================================
   DPS ENGINE
   ------------------------------------------------------------
   Per equipped petal, steady-state cycle:
     orbit period = 2π / rotation speed  (one contact per rev)
     physical hit = max(0, dmg - effArmor); dmg <= armor → negated
     petal takes  = max(0, mobBody - petalArmor) per contact;
                    0 → the petal never breaks (endless multi-hit)
     hits/cycle   = ceil(petalHP / petalTaken)
     cycle time   = hits * orbit + reload
     DPS          = hits * (physical + poison) / cycle
   ============================================================ */
function computeDPS() {
  const mods = playerMods();
  const eq = S.active.slice(0, maxSlots());
  const breakdown = [];
  let total = 0, pps = 0, fangRate = 0;

  if (!mob) { dpsBreakdown = []; return { total: 0, pps: 0, mods }; }

  const orbit = (2 * Math.PI) / mods.rot / mods.hitRate;
  const effArmor = (mob.armor || 0) - mods.burReduce; // can go below 0 (florr Bur)
  const mobBody = mob.dmg * (1 - mods.mobDmgReduce) * (mob.poisonTouch || 1);

  for (let i = 0; i < eq.length; i++) {
    const inst = eq[i];
    if (!inst) { breakdown.push(null); continue; }
    const base = PETALS[inst.id];
    const mult = T(inst.tier);
    const count = base.count || 1;

    /* healing petals → points */
    let petalPts = 0;
    if (base.heal) petalPts += (base.heal * mult) / base.reload;
    if (base.pointsPS) petalPts += base.pointsPS * mult;
    petalPts *= mods.ptsMult;
    pps += petalPts;

    /* combat */
    const dmgBase = base.dmg * mult * mods.dmgMult;
    let armorHere = base.ignoreArmor ? Math.min(0, effArmor) : effArmor;
    if (base.armorPierce) armorHere = Math.min(armorHere, effArmor * (1 - base.armorPierce));
    let phys = dmgBase - Math.max(armorHere, -dmgBase * 2); // negative armor adds damage, capped
    if (dmgBase <= armorHere) phys = 0;                     // flat negation
    if (phys < 0) phys = 0;
    if (mob.evasion && !base.bypassEvasion) phys *= (1 - mob.evasion);

    const poison = (base.poison || 0) * mult;               // ignores armor & evasion

    const petalArmor = (base.armor || 0) * mult;
    const petalHP = base.hp * mult * mods.petalHpMult;
    const taken = mobBody <= petalArmor ? 0 : mobBody - petalArmor;

    let hits, cycle, dps;
    if (taken <= 0) {
      hits = Infinity;
      cycle = orbit;
      dps = (phys + poison) / orbit;
    } else {
      hits = Math.max(1, Math.ceil(petalHP / taken));
      cycle = hits * orbit + base.reload * mods.reloadMult;
      dps = (hits * (phys + poison)) / cycle;
    }

    /* salt: reflect part of the body damage the petal absorbs */
    if (base.reflect && taken > 0) {
      const absorbed = Math.min(petalHP, taken * (hits === Infinity ? 1 : hits));
      dps += (base.reflect * UTIL_SCALE(inst.tier) * absorbed) / cycle;
    }
    /* egg: minion adds flat dps */
    if (base.minionDPS) dps += base.minionDPS * mult;

    dps *= count * mods.dpsMult;
    if (isBoss) dps *= mods.bossMult;
    if (base.fangPoints) fangRate += base.fangPoints * UTIL_SCALE(inst.tier) * (dps > 0 ? 1 : 0) * dps;

    total += dps;
    breakdown.push({ slot: i, id: inst.id, tier: inst.tier, dps, hits, cycle,
                     reload: base.reload * mods.reloadMult, phys, poison, count, petalPts });
  }

  /* fang points ride on damage dealt (tempered so it complements, not replaces, healers) */
  pps += (fangRate * 0.1) * mods.ptsMult;

  dpsBreakdown = breakdown;
  return { total, pps, mods };
}

/* ============================================================
   MOB SPAWNING / COMBAT
   ============================================================ */
function currentZone() { return ZONES.find(z => z.id === S.zone) || ZONES[0]; }

function pickTier(weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return 0;
}

function spawnMob(forceBoss = false) {
  const z = currentZone();
  isBoss = forceBoss;
  let mobId, tier;
  /* difficulty ramps with progress in THIS zone — your gear roughly tracks
     how long you've farmed here, so bosses stay hard-but-killable */
  const kz = S.killsInZone;
  const rampCap = kz < 8 ? 0 : kz < 40 ? 1 : kz < 120 ? 2 : kz < 300 ? 3 : MAX_TIER;
  const zoneMin = Math.max(0, z.rarityWeights.findIndex(w => w > 0));
  if (forceBoss) {
    mobId = z.boss;
    const top = z.rarityWeights.reduce((best, w, i) => (w > 0 ? i : best), 0);
    /* boss rarity grows with your progress instead of walling fresh flowers */
    tier = clamp(rampCap, zoneMin + 1, Math.min(MAX_TIER, top + 1));
  } else if (S.stats.kills === 0 && z.id === "garden") {
    mobId = "baby_ant"; // gentle first encounter
    tier = 0;
  } else {
    mobId = z.mobs[randInt(0, z.mobs.length - 1)];
    tier = pickTier(z.rarityWeights);
    /* soft ramp: a fresh flower shouldn't meet Rare centipedes right away */
    tier = clamp(Math.min(tier, Math.max(rampCap, zoneMin)), 0, MAX_TIER);
  }
  const base = MOBS[mobId];
  const mult = T(tier);
  mob = {
    id: mobId, tier,
    name: base.name,
    hpMax: base.hp * mult,
    hp: base.hp * mult,
    dmg: base.dmg * mult,
    armor: (base.armor || 0) * mult,
    heal: (base.heal || 0) * mult,
    evasion: base.evasion || 0,
    poisonTouch: base.poisonTouch || 1,
    passive: !!base.passive,
    skin: base.skin, color: base.color, size: base.size,
    xp: base.xp * mult,
    drops: base.drops,
    age: 0,
  };
  stallTimer = 0;
  zeroDpsTimer = 0;
  if (forceBoss) {
    toast(`⚠ ${RARITIES[tier].name} ${base.name} appeared!`, "boss-toast", 4000);
    $("boss-name").textContent = `${RARITIES[tier].name} ${base.name}`;
    $("boss-bar-wrap").classList.remove("hidden");
  } else {
    $("boss-bar-wrap").classList.add("hidden");
  }
  updateMobPanel();
}

function grantXP(amount) {
  S.xp += amount;
  S.stats.xpEarned += amount;
  let need = xpForLevel(S.level);
  while (S.xp >= need) {
    S.xp -= need;
    S.level++;
    S.tp += 1;
    toast(`⬆ Level ${S.level}! +1 TP`, "ach-toast", 3000);
    need = xpForLevel(S.level);
  }
}
function xpForLevel(l) { return Math.round(12 * Math.pow(l, 1.7) + 13 * l); }

function grantPoints(amount, fromHealing = false) {
  S.points += amount;
  S.stats.pointsEarned += amount;
  if (fromHealing) S.stats.healPoints += amount;
}

function rollDrops(m) {
  const mods = playerMods();
  const dropped = [];
  const rolls = isBoss ? 2 : 1;
  for (let r = 0; r < rolls; r++) {
    for (const [pid, ch] of m.drops) {
      if (!chance(Math.min(0.95, ch * (1 + mods.luck)))) continue;
      let tier = m.tier;
      if (!isBoss && chance(0.6)) tier = Math.max(0, tier - 1); // mobs mostly drop one rarity below
      if (chance(Math.min(0.5, 0.05 + mods.luck * 0.5))) tier = Math.min(MAX_TIER, tier + 1);
      dropped.push([pid, tier]);
    }
  }
  if (isBoss) { // bosses guarantee loot
    const [pid] = m.drops[randInt(0, m.drops.length - 1)];
    dropped.push([pid, Math.min(MAX_TIER, m.tier)]);
  }
  if (chance(mods.extraDrop) && dropped.length) {
    dropped.push(dropped[randInt(0, dropped.length - 1)]);
  }
  for (const [pid, tier] of dropped) {
    addPetal(pid, tier);
    toastDrop(pid, tier);
  }
}

function onKill() {
  const m = mob;
  const mods = playerMods();

  /* gallery */
  const g = S.gallery[m.id] || { kills: 0, byTier: {}, bestTier: 0 };
  g.kills++;
  g.byTier[m.tier] = (g.byTier[m.tier] || 0) + 1;
  g.bestTier = Math.max(g.bestTier, m.tier);
  S.gallery[m.id] = g;

  S.stats.kills++;
  if (isBoss) S.stats.bossKills++;
  grantXP(Math.round(m.xp * mods.xpMult));
  if (isBoss) grantPoints(Math.round(10 * T(m.tier) * mods.ptsMult));
  rollDrops(m);

  /* conditional achievements */
  if (m.armor > 0 && mods.burReduce > 0) unlockAch("armor_break");
  if (m.heal > 0 && mods.blockHeal) unlockAch("no_heal");

  S.killsInZone++;
  const bossNext = !isBoss && S.killsInZone % S.bossEvery === 0;
  mob = null;
  checkAchievements();
  updateHUD();
  refreshOpenPanel();
  setTimeout(() => spawnMob(bossNext), 600);
}

/* ============================================================
   GAME LOOP
   ============================================================ */
const TICK = 100; // ms
let lastSave = 0;

function tick() {
  const dt = TICK / 1000;
  S.stats.playtime += dt;

  const { total, pps, mods } = computeDPS();
  currentDPS = total;
  currentPPS = pps;
  if (total > S.stats.bestDPS) S.stats.bestDPS = total;

  /* points from healing petals */
  if (pps > 0) grantPoints(pps * dt, true);

  if (mob) {
    mob.age += dt;
    /* realistic per-tick application with jitter */
    const jitter = rand(0.82, 1.18);
    let dealt = total * dt * jitter;
    if (mob.heal > 0 && !mods.blockHeal) {
      mob.hp = Math.min(mob.hpMax, mob.hp + mob.heal * dt);
      dealt -= 0; // heal shown separately; net progress may stall
    }
    mob.hp -= dealt;
    dmgAccum += dealt;

    /* stall detection: mob out-healing us */
    if (mob.heal > 0 && !mods.blockHeal && total <= mob.heal) {
      stallTimer += dt;
      if (stallTimer > 12) {
        toast("This mob out-heals your DPS — equip a Dandelion to block healing!", "boss-toast", 5000);
        stallTimer = -20;
      }
    }

    /* no net progress in 25s (out-healed, etc.) → the mob wanders off */
    if (mob.age - (mob.ckAge || 0) > 25) {
      if (mob.hp >= (mob.ckHp ?? mob.hpMax)) {
        toast(`The ${mob.name} shrugged you off and wandered away...`, "boss-toast", 5000);
        isBoss = false;
        mob = null;
        $("boss-bar-wrap").classList.add("hidden");
        setTimeout(() => { if (!mob) spawnMob(false); }, 600);
        updateCombatUI();
        return;
      }
      mob.ckAge = mob.age;
      mob.ckHp = mob.hp;
    }

    /* armor can fully negate all damage (florr rules) — don't trap the player */
    if (total <= 0) {
      zeroDpsTimer += dt;
      if (zeroDpsTimer > 15) {
        toast(`You can't scratch the ${mob.name} — it wandered off. (Armor negates weak hits; try Bur or stronger petals!)`, "boss-toast", 6000);
        zeroDpsTimer = 0;
        isBoss = false;
        mob = null;
        $("boss-bar-wrap").classList.add("hidden");
        setTimeout(() => { if (!mob) spawnMob(false); }, 600);
        updateCombatUI();
        return;
      }
    } else {
      zeroDpsTimer = 0;
    }

    if (mob.hp <= 0) {
      mob.hp = 0;
      onKill();
    } else if (isBoss && mob.age > 120) {
      /* escape hatch: an unkillable boss loses interest after 2 minutes */
      toast(`${mob.name} lost interest and left...`, "boss-toast", 4000);
      mob = null;
      isBoss = false;
      $("boss-bar-wrap").classList.add("hidden");
      setTimeout(() => { if (!mob) spawnMob(false); }, 600);
    }
  }

  updateCombatUI();

  const now = Date.now();
  if (now - lastSave > 10000) { save(); lastSave = now; }
}

/* floaters get spawned on a slower cadence so numbers look like hits */
setInterval(() => {
  if (!mob || dmgAccum <= 0) return;
  floaters.push({
    /* anchor to the mob's position at spawn so numbers survive the kill */
    bx: 960 * 0.70 + rand(-20, 20),
    by: 380 * 0.50 - mob.size - 22 + rand(-10, 10),
    text: fmt(dmgAccum),
    t: 0,
    crit: chance(0.12),
  });
  if (floaters.length > 14) floaters.shift();
  dmgAccum = 0;
}, 380);

/* ============================================================
   ACHIEVEMENTS
   ============================================================ */
function unlockAch(id) {
  if (S.achievements[id]) return;
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (!a) return;
  S.achievements[id] = true;
  if (a.pts) grantPoints(a.pts);
  if (a.tp) S.tp += a.tp;
  toast(`🏆 ${a.name} — +${a.pts || 0} pts${a.tp ? ` +${a.tp} TP` : ""}`, "ach-toast", 4000);
}
function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (!S.achievements[a.id] && a.check(S)) unlockAch(a.id);
  }
}

/* ============================================================
   UI — HUD, slots, tooltips, toasts
   ============================================================ */
function toast(text, cls = "", ttl = 3000) {
  const el = document.createElement("div");
  el.className = "toast " + cls;
  el.style.setProperty("--ttl", ttl / 1000 + "s");
  el.textContent = text;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), ttl + 600);
}
function toastDrop(pid, tier) {
  const el = document.createElement("div");
  el.className = "toast drop";
  el.style.setProperty("--ttl", "2.6s");
  el.style.color = RARITIES[tier].color;
  el.textContent = `+ ${RARITIES[tier].name} ${PETALS[pid].name}`;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), 3300);
}

function updateHUD() {
  $("level-num").textContent = S.level;
  const need = xpForLevel(S.level);
  $("xp-fill").style.width = clamp((S.xp / need) * 100, 0, 100) + "%";
  $("xp-text").textContent = `${fmt(S.xp)} / ${fmt(need)} XP`;
  $("points-num").textContent = fmt(Math.floor(S.points));
  $("tp-num").textContent = S.tp;
  $("zone-name").textContent = currentZone().name;
  $("boss-count").textContent = isBoss ? "NOW" : (S.bossEvery - (S.killsInZone % S.bossEvery));
  document.documentElement.style.setProperty("--bg", currentZone().color);
  document.documentElement.style.setProperty("--bg-dark", currentZone().dark);
}

function updateMobPanel() {
  if (!mob) return;
  $("mob-name").textContent = mob.name;
  const chip = $("mob-rarity");
  chip.textContent = RARITIES[mob.tier].name;
  chip.className = "rarity-chip chip-" + mob.tier;
  const tags = [];
  if (mob.armor > 0) tags.push(`<span class="mob-tag armor">🛡 ${fmt(mob.armor)} armor</span>`);
  if (mob.heal > 0) tags.push(`<span class="mob-tag heal">➕ ${fmt(mob.heal)}/s regen</span>`);
  if (mob.evasion > 0) tags.push(`<span class="mob-tag evade">💨 ${Math.round(mob.evasion * 100)}% evasion</span>`);
  if (mob.poisonTouch > 1) tags.push(`<span class="mob-tag poison">☠ +${Math.round((mob.poisonTouch - 1) * 100)}% petal damage taken</span>`);
  if (mob.passive) tags.push(`<span class="mob-tag">🕊 passive</span>`);
  $("mob-tags").innerHTML = tags.join("");
}

function updateCombatUI() {
  $("dps-num").textContent = fmt(currentDPS);
  const mods = playerMods();
  const multi = dpsBreakdown.some(b => b && b.hits > 1);
  $("dps-detail").textContent =
    `${mods.rot.toFixed(1)} rad/s` +
    (mods.burReduce ? ` · -${fmt(mods.burReduce)} mob armor` : "") +
    (multi ? " · multi-hit!" : "");
  $("pps-fill").style.width = clamp(currentPPS * 4, 0, 100) + "%";
  $("pps-text").textContent = `${fmt(currentPPS)} pts/s`;
  $("points-num").textContent = fmt(Math.floor(S.points)); // points tick up live

  if (mob) {
    const pct = clamp((mob.hp / mob.hpMax) * 100, 0, 100);
    $("mob-hp-fill").style.width = pct + "%";
    $("mob-hp-text").textContent = `${fmt(Math.max(0, mob.hp))} / ${fmt(mob.hpMax)}`;
    if (isBoss) {
      $("boss-fill").style.width = pct + "%";
      $("boss-hp-text").textContent = `${fmt(Math.max(0, mob.hp))} / ${fmt(mob.hpMax)}`;
    }
  }
  $("boss-count").textContent = isBoss ? "NOW" : (S.bossEvery - (S.killsInZone % S.bossEvery));
}

/* ---------- petal slots ---------- */
function petalTooltipHTML(inst) {
  const base = PETALS[inst.id], mult = T(inst.tier);
  const lines = [];
  lines.push(`<div class="tt-name" style="color:${RARITIES[inst.tier].color}">${RARITIES[inst.tier].name} ${base.name}</div>`);
  const st = [];
  if (base.dmg) st.push(`Damage ${fmt(base.dmg * mult)}${base.count ? " ×" + base.count : ""}`);
  st.push(`Health ${fmt(base.hp * mult)}`);
  st.push(`Reload ${base.reload}s`);
  if (base.armor) st.push(`Armor ${fmt(base.armor * mult)}`);
  if (base.poison) st.push(`Poison ${fmt(base.poison * mult)}`);
  if (base.heal) st.push(`Heal ${fmt(base.heal * mult)} → pts`);
  if (base.pointsPS) st.push(`+${fmt(base.pointsPS * mult)} pts/s`);
  if (base.armorReduce) st.push(`-${fmt(base.armorReduce * mult)} mob armor`);
  if (base.minionDPS) st.push(`Minion ${fmt(base.minionDPS * mult)} DPS`);
  lines.push(`<div class="tt-stats">${st.join(" · ")}</div>`);
  lines.push(`<div class="tt-desc">${base.desc}</div>`);
  const b = dpsBreakdown.find(x => x && S.active[x.slot] === inst);
  if (b && b.dps > 0) {
    lines.push(`<div class="tt-extra">Current: ${fmt(b.dps)} DPS` +
      (b.hits === Infinity ? " · never breaks (armor tanks the mob!)"
        : b.hits > 1 ? ` · ${b.hits} hits per cycle` : "") + `</div>`);
  }
  return lines.join("");
}

function makeSlotEl(row, idx, inst, locked) {
  const el = document.createElement("div");
  el.className = "slot";
  if (locked) {
    el.classList.add("locked");
    el.textContent = "🔒";
    el.title = "Unlock with the Loadout talent";
    return el;
  }
  if (!inst) {
    el.classList.add("empty");
  } else {
    el.classList.add("rar-" + inst.tier);
    const icon = document.createElement("div");
    icon.className = "petal-icon";
    icon.style.background = PETALS[inst.id].color;
    el.appendChild(icon);
    const label = document.createElement("div");
    label.className = "slot-label";
    label.textContent = PETALS[inst.id].name;
    el.appendChild(label);
    el.addEventListener("mousemove", (e) => showTooltip(e, petalTooltipHTML(inst)));
    el.addEventListener("mouseleave", hideTooltip);
  }
  if (selectedSlot && selectedSlot.row === row && selectedSlot.idx === idx) el.classList.add("selected");
  el.addEventListener("click", () => onSlotClick(row, idx));
  return el;
}

function renderSlots() {
  const activeEl = $("active-slots"), reserveEl = $("reserve-slots");
  activeEl.innerHTML = ""; reserveEl.innerHTML = "";
  const ms = maxSlots();
  for (let i = 0; i < 10; i++) activeEl.appendChild(makeSlotEl("active", i, S.active[i], i >= ms));
  for (let i = 0; i < 10; i++) reserveEl.appendChild(makeSlotEl("reserve", i, S.reserve[i], false));
}

function slotArr(row) { return row === "active" ? S.active : S.reserve; }

function onSlotClick(row, idx) {
  if (row === "active" && idx >= maxSlots()) return;
  if (!selectedSlot) {
    if (!slotArr(row)[idx]) return; // nothing to pick up
    selectedSlot = { row, idx };
  } else if (selectedSlot.row === row && selectedSlot.idx === idx) {
    selectedSlot = null; // deselect
  } else {
    const a = slotArr(selectedSlot.row), b = slotArr(row);
    const tmp = a[selectedSlot.idx];
    a[selectedSlot.idx] = b[idx];
    b[idx] = tmp;
    selectedSlot = null;
  }
  renderSlots();
  refreshOpenPanel();
}

/* number keys swap active<->reserve column-wise, like florr */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closePanel(); selectedSlot = null; renderSlots(); return; }
  const n = "1234567890".indexOf(e.key);
  if (n >= 0 && n < maxSlots()) {
    const tmp = S.active[n];
    S.active[n] = S.reserve[n];
    S.reserve[n] = tmp;
    renderSlots();
  }
});

/* ---------- tooltip ---------- */
function showTooltip(e, html) {
  const tt = $("tooltip");
  tt.innerHTML = html;
  tt.classList.remove("hidden");
  const pad = 14;
  let x = e.clientX + pad, y = e.clientY + pad;
  const r = tt.getBoundingClientRect();
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - pad;
  tt.style.left = x + "px";
  tt.style.top = y + "px";
}
function hideTooltip() { $("tooltip").classList.add("hidden"); }

/* ============================================================
   SIDE PANELS
   ============================================================ */
function openPanel(name) {
  panelOpen = name;
  $("side-panel").classList.remove("hidden");
  document.querySelectorAll(".menu-btn").forEach(b =>
    b.classList.toggle("open", b.dataset.panel === name));
  renderPanel();
}
function closePanel() {
  panelOpen = null;
  $("side-panel").classList.add("hidden");
  document.querySelectorAll(".menu-btn").forEach(b => b.classList.remove("open"));
  hideTooltip();
}
function refreshOpenPanel() { if (panelOpen) renderPanel(); }

function renderPanel() {
  const body = $("panel-body");
  const titles = { inventory: "Inventory", crafting: "Crafting", absorb: "Absorb",
                   talents: "Talents", gallery: "Mob Gallery", achievements: "Achievements",
                   shop: "Shop & Map", stats: "Statistics", settings: "Settings" };
  $("panel-title").textContent = titles[panelOpen] || "";
  body.innerHTML = "";
  hideTooltip();
  ({ inventory: renderInventory, crafting: renderCrafting, absorb: renderAbsorb,
     talents: renderTalents, gallery: renderGallery, achievements: renderAchievements,
     shop: renderShop, stats: renderStats, settings: renderSettings }[panelOpen] || (() => {}))(body);
}

/* ---------- inventory ---------- */
function stackEl(entry, onClick, selected) {
  const el = document.createElement("div");
  el.className = "inv-stack rar-" + entry.tier + (selected ? " selected" : "");
  const icon = document.createElement("div");
  icon.className = "petal-icon";
  icon.style.background = PETALS[entry.id].color;
  el.appendChild(icon);
  const label = document.createElement("div");
  label.className = "slot-label";
  label.textContent = PETALS[entry.id].name;
  el.appendChild(label);
  const count = document.createElement("div");
  count.className = "stack-count";
  count.textContent = "×" + fmtInt(entry.count);
  el.appendChild(count);
  el.addEventListener("mousemove", (e) => showTooltip(e, petalTooltipHTML({ id: entry.id, tier: entry.tier })));
  el.addEventListener("mouseleave", hideTooltip);
  if (onClick) el.addEventListener("click", () => onClick(entry));
  return el;
}

function renderInventory(body) {
  const note = document.createElement("div");
  note.className = "panel-note";
  note.textContent = "Click a petal to send it to your reserve row (bottom). Click two slots down there to swap; press 1–0 to quick-swap columns. Click an equipped petal, then an empty slot, to move it back.";
  body.appendChild(note);
  const entries = invEntries();
  if (!entries.length) {
    body.insertAdjacentHTML("beforeend", `<div class="inv-empty">No petals yet — go defeat some mobs!</div>`);
    return;
  }
  const grid = document.createElement("div");
  grid.className = "inv-grid";
  for (const e of entries) {
    grid.appendChild(stackEl(e, (entry) => {
      const idx = S.reserve.findIndex(x => x === null);
      if (idx === -1) { toast("Reserve row is full!", "", 2000); return; }
      if (removePetal(entry.id, entry.tier)) {
        S.reserve[idx] = { id: entry.id, tier: entry.tier };
        renderSlots(); renderPanel();
      }
    }));
  }
  body.appendChild(grid);

  const btn = document.createElement("button");
  btn.className = "btn small red";
  btn.style.marginTop = "12px";
  btn.textContent = "Unequip everything";
  btn.addEventListener("click", () => {
    for (const arr of [S.active, S.reserve]) {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i]) { addPetal(arr[i].id, arr[i].tier); arr[i] = null; }
      }
    }
    renderSlots(); renderPanel();
  });
  body.appendChild(btn);
}

/* ---------- crafting ---------- */
let craftSel = null; // "id:tier"
function renderCrafting(body) {
  body.insertAdjacentHTML("beforeend",
    `<div class="panel-note">Combine <b>5 identical petals</b> into 1 of the next rarity — florr rules: on failure, 1–4 of the 5 are destroyed. Luck (Clover, Fortune) improves your odds.</div>`);

  const box = document.createElement("div");
  box.className = "craft-box";
  if (craftSel && !S.inventory[craftSel]) craftSel = null;
  if (craftSel) {
    const [id, tierS] = craftSel.split(":");
    const tier = +tierS;
    const have = S.inventory[craftSel] || 0;
    const baseCh = CRAFT_CHANCE[tier] ?? 0;
    const ch = Math.min(0.95, baseCh * (1 + playerMods().luck));
    box.innerHTML =
      `<div><span class="rarity-chip chip-${tier}">${RARITIES[tier].name}</span> <b>${PETALS[id].name}</b> ×${fmtInt(have)}</div>
       <div class="craft-odds">${(ch * 100).toFixed(1)}%</div>
       <div>→ <span class="rarity-chip chip-${Math.min(MAX_TIER, tier + 1)}">${RARITIES[Math.min(MAX_TIER, tier + 1)].name}</span> ${PETALS[id].name}</div>
       <div class="craft-result" id="craft-result"></div>`;
    const row = document.createElement("div");
    row.style.marginTop = "8px";
    const b1 = document.createElement("button");
    b1.className = "btn green";
    b1.textContent = "Craft ×1 (uses 5)";
    b1.disabled = have < 5 || tier >= MAX_TIER;
    b1.addEventListener("click", () => doCraft(id, tier, 1));
    const b2 = document.createElement("button");
    b2.className = "btn purple";
    b2.style.marginLeft = "8px";
    b2.textContent = "Craft all";
    b2.disabled = have < 5 || tier >= MAX_TIER;
    b2.addEventListener("click", () => doCraft(id, tier, Math.floor((S.inventory[craftSel] || 0) / 5)));
    row.append(b1, b2);
    box.appendChild(row);
  } else {
    box.innerHTML = `<div class="inv-empty">Select a stack below (needs ×5).</div>`;
  }
  body.appendChild(box);

  const grid = document.createElement("div");
  grid.className = "inv-grid";
  for (const e of invEntries()) {
    if (e.tier >= MAX_TIER) continue;
    const el = stackEl(e, (entry) => { craftSel = invKey(entry.id, entry.tier); renderPanel(); },
                       craftSel === invKey(e.id, e.tier));
    if (e.count < 5) el.style.opacity = .45;
    grid.appendChild(el);
  }
  body.appendChild(grid);
}

function doCraft(id, tier, times) {
  const mods = playerMods();
  const ch = Math.min(0.95, (CRAFT_CHANCE[tier] ?? 0) * (1 + mods.luck));
  let ok = 0, lost = 0;
  for (let i = 0; i < times; i++) {
    if ((S.inventory[invKey(id, tier)] || 0) < 5) break;
    if (chance(ch)) {
      removePetal(id, tier, 5);
      addPetal(id, tier + 1);
      ok++;
      S.stats.crafts++;
    } else {
      const destroyed = randInt(1, 4); // florr: failed craft destroys 1-4 petals
      removePetal(id, tier, destroyed);
      lost += destroyed;
      S.stats.craftFails++;
    }
  }
  checkAchievements();
  renderPanel();
  const res = $("craft-result");
  if (res) {
    if (ok > 0) {
      res.className = "craft-result ok";
      res.textContent = `✔ Crafted ${ok} ${RARITIES[Math.min(MAX_TIER, tier + 1)].name} ${PETALS[id].name}${lost ? ` (${lost} petals lost on fails)` : ""}!`;
    } else {
      res.className = "craft-result bad";
      res.textContent = `✘ Craft failed — ${lost} petal${lost === 1 ? "" : "s"} destroyed.`;
    }
  }
  updateHUD();
}

/* ---------- absorb ---------- */
function absorbXP(tier) { return Math.round(2 * T(tier)); }
function renderAbsorb(body) {
  body.insertAdjacentHTML("beforeend",
    `<div class="panel-note">Permanently destroy petals to gain XP for your tech tree. Higher rarities give far more XP (×3 per tier). Scholar talent boosts this.</div>`);
  const entries = invEntries();
  if (!entries.length) {
    body.insertAdjacentHTML("beforeend", `<div class="inv-empty">Nothing to absorb.</div>`);
    return;
  }
  const grid = document.createElement("div");
  grid.className = "inv-grid";
  for (const e of entries) {
    const el = stackEl(e, null, false);
    const info = document.createElement("div");
    info.className = "slot-label";
    info.style.color = "#ffe65d";
    info.textContent = `+${fmt(absorbXP(e.tier))} xp`;
    el.appendChild(info);
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "3px";
    row.style.marginTop = "3px";
    for (const [label, n] of [["+1", 1], ["all", e.count]]) {
      const b = document.createElement("button");
      b.className = "btn small";
      b.style.padding = "1px 6px";
      b.style.fontSize = "10px";
      b.textContent = label;
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        doAbsorb(e.id, e.tier, n);
      });
      row.appendChild(b);
    }
    el.appendChild(row);
    grid.appendChild(el);
  }
  body.appendChild(grid);
}
function doAbsorb(id, tier, n) {
  const have = S.inventory[invKey(id, tier)] || 0;
  n = Math.min(n, have);
  if (n <= 0) return;
  removePetal(id, tier, n);
  S.stats.absorbed += n;
  const xp = Math.round(absorbXP(tier) * n * playerMods().xpMult);
  grantXP(xp);
  toast(`💠 Absorbed ${n} petal${n > 1 ? "s" : ""} → +${fmt(xp)} XP`, "", 2500);
  checkAchievements();
  updateHUD();
  renderPanel();
}

/* ---------- talents ---------- */
function renderTalents(body) {
  body.insertAdjacentHTML("beforeend",
    `<div class="panel-note">Spend <b>★ ${S.tp} TP</b> (earned each level). Respec any time for free, like the real game.</div>`);
  for (const row of TALENT_ROWS) {
    body.insertAdjacentHTML("beforeend",
      `<div class="talent-row-title">— unlocks at level ${row.lvl} —</div>`);
    for (const id of row.ids) {
      const t = TALENTS[id];
      const rank = talentRank(id);
      const locked = S.level < t.lvl;
      const el = document.createElement("div");
      el.className = "talent" + (rank >= t.max ? " maxed" : "") + (locked ? " locked" : "");
      const cost = rank < t.max ? t.costs[rank] : null;
      el.innerHTML =
        `<div class="ach-icon">${t.icon}</div>
         <div class="talent-info">
           <div class="talent-name">${t.name} <span class="talent-rank">${rank}/${t.max}</span></div>
           <div class="talent-desc">${t.desc}</div>
         </div>`;
      const btn = document.createElement("button");
      btn.className = "btn small green";
      btn.textContent = rank >= t.max ? "MAX" : `${cost} TP`;
      btn.disabled = locked || rank >= t.max || S.tp < cost;
      btn.addEventListener("click", () => {
        if (S.tp < cost) return;
        S.tp -= cost;
        S.talents[id] = rank + 1;
        checkAchievements();
        renderSlots(); updateHUD(); renderPanel();
      });
      el.appendChild(btn);
      body.appendChild(el);
    }
  }
  const respec = document.createElement("button");
  respec.className = "btn red";
  respec.style.marginTop = "10px";
  respec.textContent = "Reset all talents (free)";
  respec.addEventListener("click", () => {
    let refund = 0;
    for (const [id, rank] of Object.entries(S.talents)) {
      for (let r = 0; r < rank; r++) refund += TALENTS[id].costs[r];
    }
    S.talents = {};
    S.tp += refund;
    /* keep equipped petals in now-locked slots? move extras to inventory */
    for (let i = maxSlots(); i < 10; i++) {
      if (S.active[i]) { addPetal(S.active[i].id, S.active[i].tier); S.active[i] = null; }
    }
    renderSlots(); updateHUD(); renderPanel();
  });
  body.appendChild(respec);
}

/* ---------- gallery ---------- */
let gallerySel = null;
function renderGallery(body) {
  const discovered = Object.keys(S.gallery).length;
  const totalMobs = Object.keys(MOBS).length;
  body.insertAdjacentHTML("beforeend",
    `<div class="panel-note">Every mob you've defeated — ${discovered}/${totalMobs} discovered. Click one for details.</div>`);

  if (gallerySel && S.gallery[gallerySel]) {
    const base = MOBS[gallerySel], g = S.gallery[gallerySel];
    const byTier = Object.entries(g.byTier).sort((a, b) => a[0] - b[0])
      .map(([t, n]) => `<span class="rarity-chip chip-${t}">${RARITIES[t].name} ×${fmtInt(n)}</span>`).join(" ");
    body.insertAdjacentHTML("beforeend",
      `<div class="gallery-detail">
         <b>${base.name}</b>${base.boss ? " 👑" : ""}<br>
         <i>${base.desc}</i><br>
         Base HP ${fmt(base.hp)} · Body damage ${fmt(base.dmg)}` +
         (base.armor ? ` · Armor ${fmt(base.armor)}` : "") +
         (base.heal ? ` · Regen ${fmt(base.heal)}/s` : "") +
         (base.evasion ? ` · Evasion ${Math.round(base.evasion * 100)}%` : "") +
         ` · ${fmt(base.xp)} XP<br>
         Drops: ${base.drops.map(([p, c]) => `${PETALS[p].name} ${(c * 100).toFixed(1)}%`).join(", ")}<br>
         Defeated ${fmtInt(g.kills)}× — ${byTier}
       </div>`);
  }

  const grid = document.createElement("div");
  grid.className = "gallery-grid";
  for (const [id, base] of Object.entries(MOBS)) {
    const g = S.gallery[id];
    const cell = document.createElement("div");
    cell.className = "gallery-cell" + (g ? "" : " unknown");
    const dot = document.createElement("div");
    dot.className = "gallery-mob-dot";
    dot.style.background = g ? base.color : "#333";
    if (g) dot.style.borderColor = RARITIES[g.bestTier].color;
    cell.appendChild(dot);
    const label = document.createElement("div");
    label.className = "slot-label";
    label.textContent = g ? base.name : "???";
    cell.appendChild(label);
    if (g) {
      const k = document.createElement("div");
      k.className = "slot-label";
      k.style.opacity = ".7";
      k.textContent = "×" + fmtInt(g.kills);
      cell.appendChild(k);
      cell.addEventListener("click", () => { gallerySel = id; renderPanel(); });
    }
    grid.appendChild(cell);
  }
  body.appendChild(grid);
}

/* ---------- achievements ---------- */
function renderAchievements(body) {
  const done = Object.keys(S.achievements).length;
  body.insertAdjacentHTML("beforeend",
    `<div class="panel-note">${done}/${ACHIEVEMENTS.length} completed. Rewards are Points and sometimes TP.</div>`);
  for (const a of ACHIEVEMENTS) {
    const got = !!S.achievements[a.id];
    body.insertAdjacentHTML("beforeend",
      `<div class="ach${got ? " done" : ""}">
         <div class="ach-icon">${got ? a.icon : "🔒"}</div>
         <div class="ach-info">
           <div class="ach-name">${a.name}</div>
           <div class="ach-desc">${a.desc}</div>
         </div>
         <div class="ach-reward">${a.pts ? `+${fmt(a.pts)} pts` : ""}${a.tp ? `<br>+${a.tp} TP` : ""}</div>
       </div>`);
  }
}

/* ---------- shop / map ---------- */
const SHOP_BUFFS = [
  { id: "rush", name: "Nectar Rush", desc: "+50% DPS for 2 minutes.", cost: 200, icon: "⚡" },
  { id: "lucky", name: "Lucky Breeze", desc: "+25% luck for 2 minutes.", cost: 150, icon: "🍀" },
  { id: "focus", name: "Honeyed Focus", desc: "+50% Points gained for 2 minutes.", cost: 250, icon: "🍯" },
];
function renderShop(body) {
  body.insertAdjacentHTML("beforeend",
    `<div class="panel-note">Spend <b>✿ ${fmt(Math.floor(S.points))} Points</b> — earned by healing petals (Rose, Leaf, Starfish, Fang), bosses and achievements.</div>
     <div class="panel-section-title">World Map</div>`);
  for (const z of ZONES) {
    const unlocked = S.unlockedZones.includes(z.id);
    const card = document.createElement("div");
    card.className = "shop-card" + (S.zone === z.id ? " active-zone" : "");
    card.innerHTML =
      `<div class="zone-dot" style="background:${z.color}"></div>
       <div class="shop-info">
         <div class="shop-name">${z.name}</div>
         <div class="shop-desc">${z.desc}</div>
         <div class="shop-desc">${unlocked ? "Unlocked" : `Requires level ${z.lvl} · ✿ ${fmt(z.cost)}`}</div>
       </div>`;
    const btn = document.createElement("button");
    btn.className = "btn small " + (unlocked ? "green" : "gold");
    if (unlocked) {
      btn.textContent = S.zone === z.id ? "Here" : "Travel";
      btn.disabled = S.zone === z.id;
      btn.addEventListener("click", () => {
        S.zone = z.id;
        S.killsInZone = 0;
        isBoss = false;
        spawnMob(false);
        updateHUD(); renderPanel();
        toast(`🗺️ Traveled to ${z.name}`, "", 2500);
      });
    } else {
      btn.textContent = "Unlock";
      btn.disabled = S.level < z.lvl || S.points < z.cost;
      btn.addEventListener("click", () => {
        if (S.points < z.cost || S.level < z.lvl) return;
        S.points -= z.cost;
        S.unlockedZones.push(z.id);
        checkAchievements();
        updateHUD(); renderPanel();
        toast(`🔓 ${z.name} unlocked!`, "ach-toast", 3000);
      });
    }
    card.appendChild(btn);
    body.appendChild(card);
  }

  body.insertAdjacentHTML("beforeend", `<div class="panel-section-title">Buffs</div>`);
  for (const bdef of SHOP_BUFFS) {
    const active = buffActive(bdef.id);
    const card = document.createElement("div");
    card.className = "shop-card";
    card.innerHTML =
      `<div class="ach-icon">${bdef.icon}</div>
       <div class="shop-info">
         <div class="shop-name">${bdef.name}</div>
         <div class="shop-desc">${bdef.desc}${active ? ` · <b>${Math.ceil((buffs[bdef.id] - Date.now()) / 1000)}s left</b>` : ""}</div>
       </div>`;
    const btn = document.createElement("button");
    btn.className = "btn small gold";
    btn.textContent = `✿ ${bdef.cost}`;
    btn.disabled = S.points < bdef.cost;
    btn.addEventListener("click", () => {
      if (S.points < bdef.cost) return;
      S.points -= bdef.cost;
      buffs[bdef.id] = Math.max(buffs[bdef.id] || 0, Date.now()) + 120000;
      updateHUD(); renderPanel();
      toast(`${bdef.icon} ${bdef.name} active!`, "", 2500);
    });
    card.appendChild(btn);
    body.appendChild(card);
  }
}

/* ---------- stats ---------- */
function renderStats(body) {
  const st = S.stats;
  const mins = Math.floor(st.playtime / 60);
  const rows = [
    ["Play time", `${Math.floor(mins / 60)}h ${mins % 60}m`],
    ["Mobs defeated", fmtInt(st.kills)],
    ["Bosses defeated", fmtInt(st.bossKills)],
    ["Best DPS", fmt(st.bestDPS)],
    ["XP earned", fmt(st.xpEarned)],
    ["Points earned", fmt(st.pointsEarned)],
    ["…from healing", fmt(st.healPoints)],
    ["Petals found", fmtInt(st.petalsFound)],
    ["Petals absorbed", fmtInt(st.absorbed)],
    ["Crafts succeeded", fmtInt(st.crafts)],
    ["Crafts failed", fmtInt(st.craftFails)],
    ["Best rarity found", RARITIES[st.bestTier].name],
    ["Mobs discovered", `${Object.keys(S.gallery).length}/${Object.keys(MOBS).length}`],
  ];
  body.insertAdjacentHTML("beforeend", rows.map(([k, v]) =>
    `<div class="ach"><div class="ach-info"><div class="ach-name">${k}</div></div><div class="ach-reward">${v}</div></div>`).join(""));
}

/* ---------- settings ---------- */
function renderSettings(body) {
  body.insertAdjacentHTML("beforeend",
    `<div class="panel-note">florr.idle — a fan adaptation of <b>florr.io</b>. Petal &amp; mob stats follow the community wiki's documented Common values with ×3 rarity scaling; armor is flat damage reduction; Bur's debuff doesn't stack (but goes below zero); crafting is 5→1 with florr's fail rule. Saves locally in your browser.</div>`);
  const exp = document.createElement("button");
  exp.className = "btn green";
  exp.textContent = "Copy save to clipboard";
  exp.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(btoa(JSON.stringify(S))); toast("Save copied!", "", 2000); }
    catch (e) { toast("Clipboard unavailable", "", 2000); }
  });
  body.appendChild(exp);

  const impWrap = document.createElement("div");
  impWrap.style.marginTop = "10px";
  const ta = document.createElement("textarea");
  ta.placeholder = "Paste a save string here…";
  ta.style.cssText = "width:100%;height:60px;border-radius:8px;padding:6px;font-size:11px;background:#1a1a20;color:#fff;border:2px solid var(--line)";
  const imp = document.createElement("button");
  imp.className = "btn purple";
  imp.style.marginTop = "6px";
  imp.textContent = "Import save";
  imp.addEventListener("click", () => {
    try {
      const data = JSON.parse(atob(ta.value.trim()));
      S = Object.assign(freshState(), data);
      save();
      location.reload();
    } catch (e) { toast("Invalid save string", "", 2500); }
  });
  impWrap.append(ta, imp);
  body.appendChild(impWrap);

  const reset = document.createElement("button");
  reset.className = "btn red";
  reset.style.marginTop = "16px";
  reset.textContent = "⚠ Hard reset (wipe save)";
  reset.addEventListener("click", () => {
    if (!confirm("Wipe your entire save? This cannot be undone.")) return;
    localStorage.removeItem(SAVE_KEY);
    S = freshState();
    location.reload();
  });
  body.appendChild(reset);
}

/* ============================================================
   CANVAS ARENA
   ============================================================ */
const canvas = $("arena");
const ctx = canvas.getContext("2d");
const CW = canvas.width, CH = canvas.height;
let orbitAngle = 0, lastFrame = performance.now();

function drawFlower(x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  /* body */
  ctx.fillStyle = "#ffe763";
  ctx.strokeStyle = "#d3bc42";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  /* face */
  ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.ellipse(-r * 0.32, -r * 0.15, r * 0.10, r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(r * 0.32, -r * 0.15, r * 0.10, r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, r * 0.25, r * 0.35, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawPetalDot(x, y, petal, tier, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = petal.color;
  ctx.strokeStyle = RARITIES[tier].color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) * f, 0, 255),
        g = clamp(((n >> 8) & 255) * f, 0, 255),
        b = clamp((n & 255) * f, 0, 255);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function drawMob(x, y, m, t) {
  const r = m.size * (isBoss ? 1.15 : 1);
  const wob = Math.sin(t / 300) * 3;
  ctx.save();
  ctx.translate(x, y + wob);

  /* rarity ring */
  ctx.strokeStyle = RARITIES[m.tier].color;
  ctx.lineWidth = 4;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.arc(0, 0, r + 12, t / 900, t / 900 + Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const body = m.color, edge = shade(m.color, 0.65);
  ctx.lineWidth = 5;

  const skin = m.skin;
  if (skin === "centi") {
    for (let i = 2; i >= 0; i--) {
      ctx.fillStyle = i === 0 ? body : shade(body, 0.9 - i * 0.08);
      ctx.strokeStyle = edge;
      ctx.beginPath();
      ctx.arc(i * r * 0.9, Math.sin(t / 250 + i) * 4, r * (1 - i * 0.12), 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  } else if (skin === "ant") {
    ctx.fillStyle = body; ctx.strokeStyle = edge;
    ctx.beginPath(); ctx.arc(r * 0.75, 0, r * 0.7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); // abdomen
    ctx.beginPath(); ctx.arc(-r * 0.35, 0, r * 0.62, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); // head
    ctx.strokeStyle = edge; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-r * 0.8, -r * 0.3); ctx.lineTo(-r * 1.25, -r * 0.75); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 0.8, r * 0.3); ctx.lineTo(-r * 1.25, r * 0.75); ctx.stroke();
  } else if (skin === "bee") {
    ctx.fillStyle = body; ctx.strokeStyle = edge;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.75, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.55)";
    for (const sx of [-r * 0.45, 0.5, r * 0.45]) {
      ctx.beginPath(); ctx.ellipse(typeof sx === "number" ? sx : 0, 0, r * 0.13, r * 0.72, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.beginPath(); ctx.ellipse(-r * 0.1, -r * 0.85, r * 0.5, r * 0.28, -0.4, 0, Math.PI * 2); ctx.fill();
  } else if (skin === "bug") {
    ctx.fillStyle = body; ctx.strokeStyle = edge;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.5)";
    for (const [sx, sy] of [[-r*0.4,-r*0.3],[r*0.3,-r*0.45],[r*0.45,r*0.25],[-r*0.2,r*0.4]]) {
      ctx.beginPath(); ctx.arc(sx, sy, r * 0.13, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#222";
    ctx.beginPath(); ctx.arc(-r * 0.95, 0, r * 0.35, 0, Math.PI * 2); ctx.fill();
  } else if (skin === "spider") {
    ctx.strokeStyle = edge; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const a = -0.7 + i * 0.45;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r * 1.6 * s, Math.sin(a + Math.sin(t / 200) * 0.1) * r * 1.4);
        ctx.stroke();
      }
    }
    ctx.fillStyle = body; ctx.strokeStyle = edge; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (skin === "rock") {
    ctx.fillStyle = body; ctx.strokeStyle = edge;
    ctx.beginPath();
    const sides = 7;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const rr = r * (0.85 + 0.18 * Math.sin(i * 2.7));
      ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (skin === "jelly") {
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = body; ctx.strokeStyle = edge;
    ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 3;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * r * 0.3, 0);
      ctx.quadraticCurveTo(i * r * 0.3 + Math.sin(t / 200 + i) * 6, r * 0.7, i * r * 0.3, r * 1.2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (skin === "crab") {
    ctx.fillStyle = body; ctx.strokeStyle = edge;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.75, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(-r * 1.1, s * r * 0.55, r * 0.38, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  } else if (skin === "star") {
    ctx.fillStyle = body; ctx.strokeStyle = edge;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + t / 1500;
      const rr = i % 2 ? r * 0.5 : r;
      ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (skin === "moth") {
    ctx.fillStyle = shade(body, 1.1); ctx.strokeStyle = edge;
    const flap = Math.abs(Math.sin(t / 90)) * 0.5 + 0.5;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * r * 0.55, 0, r * 0.65, r * 0.95 * flap, s * 0.35, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.32, r * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (skin === "mech") {
    ctx.fillStyle = body; ctx.strokeStyle = edge;
    const teeth = 8;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2 + t / 1200;
      const rr = i % 2 ? r : r * 0.8;
      ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = shade(body, 0.6);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = body; ctx.strokeStyle = edge;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  /* boss crown */
  if (isBoss) {
    ctx.fillStyle = "#ffd700";
    ctx.strokeStyle = "#b8960a";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const cw = r * 0.8, cy = -r - 18;
    ctx.moveTo(-cw / 2, cy + 12);
    ctx.lineTo(-cw / 2, cy);
    ctx.lineTo(-cw / 4, cy + 7);
    ctx.lineTo(0, cy - 4);
    ctx.lineTo(cw / 4, cy + 7);
    ctx.lineTo(cw / 2, cy);
    ctx.lineTo(cw / 2, cy + 12);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function render(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  const mods = playerMods();
  orbitAngle += mods.rot * dt;

  ctx.clearRect(0, 0, CW, CH);

  /* subtle zone-tinted arena floor */
  const z = currentZone();
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, CW, CH, 16); else ctx.rect(0, 0, CW, CH);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  for (let gx = 40; gx < CW; gx += 40) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, CH); ctx.stroke();
  }
  for (let gy = 40; gy < CH; gy += 40) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(CW, gy); ctx.stroke();
  }

  const fx = CW * 0.30, fy = CH * 0.52;
  const mx = CW * 0.70, my = CH * 0.50;

  /* orbiting petals (cosmetic; reload gaps shown via fade) */
  const eq = S.active.slice(0, maxSlots());
  const slots = eq.map((p, i) => ({ p, i })).filter(o => o.p);
  const n = Math.max(1, slots.length);
  slots.forEach((o, k) => {
    const base = PETALS[o.p.id];
    const b = dpsBreakdown[o.i];
    let alpha = 1;
    if (b && b.cycle > 0 && b.hits !== Infinity && b.reload > 0.3) {
      const phase = (now / 1000 + o.i * 1.37) % b.cycle;
      if (phase > b.cycle - b.reload) alpha = 0.18; // reloading
    }
    const cnt = base.count || 1;
    for (let c = 0; c < cnt; c++) {
      const a = orbitAngle + ((k + c / cnt / 2) / n) * Math.PI * 2 + c * 0.22;
      const px = fx + Math.cos(a) * 62, py = fy + Math.sin(a) * 62;
      ctx.globalAlpha = alpha;
      drawPetalDot(px, py, base, o.p.tier, 8);
      ctx.globalAlpha = 1;
    }
  });

  drawFlower(fx, fy, 30);
  if (mob) {
    drawMob(mx, my, mob, now);
    /* hit sparks */
    if (currentDPS > 0 && chance(0.3)) {
      ctx.fillStyle = "rgba(255,255,255,.8)";
      ctx.beginPath();
      ctx.arc(mx + rand(-mob.size, mob.size) * 0.7, my + rand(-mob.size, mob.size) * 0.7, rand(1.5, 3.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* damage floaters */
  for (const f of floaters) {
    f.t += dt;
    const a = clamp(1 - f.t / 1.1, 0, 1);
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    ctx.font = `bold ${f.crit ? 22 : 16}px Ubuntu, sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,.7)";
    ctx.fillStyle = f.crit ? "#ffe65d" : "#ffffff";
    const yy = f.by - f.t * 34;
    ctx.strokeText(f.text, f.bx, yy);
    ctx.fillText(f.text, f.bx, yy);
    ctx.globalAlpha = 1;
  }
  floaters = floaters.filter(f => f.t < 1.1);

  requestAnimationFrame(render);
}

/* ============================================================
   INIT
   ============================================================ */
function initNewPlayer() {
  /* starter kit: 5 Basics equipped + a Rose, Fast and Leaf in reserve */
  for (let i = 0; i < 5; i++) S.active[i] = { id: "basic", tier: 0 };
  S.reserve[0] = { id: "rose", tier: 0 };
  S.reserve[1] = { id: "fast", tier: 0 };
  S.reserve[2] = { id: "leaf", tier: 0 };
}

function wireUI() {
  document.querySelectorAll(".menu-btn").forEach(b => {
    b.addEventListener("click", () => {
      if (panelOpen === b.dataset.panel) closePanel();
      else openPanel(b.dataset.panel);
    });
  });
  $("panel-close").addEventListener("click", closePanel);
  $("zone-btn").addEventListener("click", () => openPanel("shop"));
  $("stats-btn").addEventListener("click", () => openPanel("stats"));
  $("settings-btn").addEventListener("click", () => openPanel("settings"));
  window.addEventListener("beforeunload", save);
}

function boot() {
  if (!load()) {
    initNewPlayer();
    setTimeout(() => {
      toast("🌸 Welcome to florr.idle! Your petals fight automatically.", "ach-toast", 5000);
      setTimeout(() => toast("Equip the Rose from your reserve row to start earning Points.", "", 5000), 1800);
    }, 400);
  }
  wireUI();
  renderSlots();
  updateHUD();
  spawnMob(false);
  setInterval(tick, TICK);
  requestAnimationFrame(render);
}

boot();
