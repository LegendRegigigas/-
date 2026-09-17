// ================= 小队远征 V2 · 纯逻辑（抽卡/突破/职业装备/回避） =================
const CLASSES = [
  {id:'soldier', cls:'士兵', icon:'⚔️', role:'dps',  skillName:'顺劈斩',
   stars:{hp:3,atk:2,def:2,eva:1,crit:2}, desc:'均衡近战，前线输出'},
  {id:'knight',  cls:'骑士', icon:'🛡️', role:'tank', skillName:'盾墙',
   stars:{hp:3,atk:1,def:4,eva:1,crit:1}, desc:'铜墙铁壁，嘲讽护队'},
  {id:'rogue',   cls:'刺客', icon:'🗡️', role:'dps',  skillName:'暗影打击',
   stars:{hp:1,atk:2,def:1,eva:3,crit:2}, desc:'高闪避，暴击爆发'},
  {id:'mage',    cls:'法师', icon:'🔮', role:'dps',  skillName:'烈焰风暴',
   stars:{hp:1,atk:3,def:1,eva:2,crit:2}, desc:'烈焰横扫全体敌人'},
  {id:'priest',  cls:'牧师', icon:'✨', role:'heal', skillName:'治疗术',
   stars:{hp:4,atk:1,def:1,eva:1,crit:2}, desc:'圣光治愈最虚弱队友'},
];
const CLASS_MAP = {}; CLASSES.forEach(c=>CLASS_MAP[c.id]=c);

const STAR_HP   = [0,100,145,195,260];
const STAR_ATK  = [0,16,24,34,46];
const STAR_DEF  = [0,3,7,12,20];
const STAR_EVA  = [0,5,10,18,28];
const STAR_CRIT = [0,5,15,25,35];

const FOE_DEFS = {
  orc:     {name:'兽人步兵',   icon:'👹', hp:120, atk:16, def:6,  eva:0, crit:5,  speed:0.9, skill:'smash'},
  troll:   {name:'巨魔射手',   icon:'🏹', hp:85,  atk:22, def:3,  eva:5, crit:12, speed:1.1, skill:'double'},
  warlock: {name:'邪能术士',   icon:'🔥', hp:75,  atk:26, def:2,  eva:5, crit:8,  speed:0.9, skill:'bolt'},
  ogre:    {name:'食人魔之王', icon:'👿', hp:420, atk:30, def:8,  eva:0, crit:10, speed:0.7, skill:'quake'},
};

const RARITY = [
  {k:'common', name:'普通', c:'#9fb2c0', mul:1.0,  w:55},
  {k:'fine',   name:'优秀', c:'#4da3ff', mul:1.35, w:30},
  {k:'epic',   name:'史诗', c:'#b26bff', mul:1.8,  w:12},
  {k:'legend', name:'传说', c:'#ffa726', mul:2.4,  w:3},
];

const SLOT_NAMES = {weapon:'武器', armor:'防具', trinket:'饰品'};
const CLS_ITEMS = {
  soldier:{weapon:['制式长剑','精钢巨剑','屠龙之刃'], armor:['士兵铠甲','征战胸甲'], trinket:['士兵徽记','勇气护符']},
  knight: {weapon:['骑士重锤','审判之剑'],            armor:['塔盾重铠','圣殿铠甲'], trinket:['守护指环','壁垒之心']},
  rogue:  {weapon:['淬毒匕首','暗影双刃'],            armor:['潜行皮甲','夜行衣'],   trinket:['刺客印记','影踪坠饰']},
  mage:   {weapon:['奥术法杖','烈焰法典'],            armor:['法师长袍','秘术斗篷'], trinket:['魔力水晶','元素宝珠']},
  priest: {weapon:['神圣权杖','治愈圣典'],            armor:['牧师长袍','圣职法衣'], trinket:['圣光吊坠','祈祷珠串']},
};

let _uid = 1;
function rnd(a,b){ return a + Math.random()*(b-a); }
function ri(a,b){ return Math.floor(rnd(a,b+1)); }

function newEntry(id){
  return { id, level:1, brk:0, shards:0, awake:false, nick:CLASS_MAP[id].cls,
           equip:{weapon:null, armor:null, trinket:null} };
}

function newGame(){
  return { ver:2, gold:120, stage:1, wins:0, tickets:50, tutGacha:false,
           collection:{}, team:[], bag:[] };
}

// ---------- 存档迁移（V1 -> V2） ----------
function migrate(g){
  if (!g) return newGame();
  if (g.collection) { g.team = (g.team||[]).filter(id=>g.collection[id]); if(!g.team.length && Object.keys(g.collection).length) g.team = Object.keys(g.collection).slice(0,5); return g; }
  const OLD = {warrior:'soldier', tank:'knight', rogue:'rogue', mage:'mage', priest:'priest'};
  const ng = newGame();
  ng.gold = g.gold||120; ng.stage = g.stage||1; ng.wins = g.wins||0;
  ng.tickets = 50; // 版本更新补偿
  for (const h of (g.heroes||[])){
    const id = OLD[h.id]; if (!id || ng.collection[id]) continue;
    const e = newEntry(id);
    e.level = h.level||1;
    for (const slot of ['weapon','armor','trinket']){
      const it = h.equip && h.equip[slot];
      if (it){ it.cls = id; e.equip[slot] = it; }
    }
    ng.collection[id] = e; ng.team.push(id);
  }
  ng.bag = (g.bag||[]).map(it => { if (!it.cls) it.cls = CLASSES[ri(0,4)].id; return it; });
  return ng;
}

// ---------- 抽卡 ----------
function gachaPull(g){
  if (g.tickets < 1) return {ok:false, msg:'召唤卷不足，去闯关获取吧'};
  g.tickets--; g.tutGacha = true;
  const c = CLASSES[ri(0,4)];
  let isNew=false, brkUp=false, awake=false;
  if (!g.collection[c.id]){
    g.collection[c.id] = newEntry(c.id);
    isNew = true;
    if (g.team.length < 5) g.team.push(c.id);
  } else {
    const e = g.collection[c.id];
    e.shards++;
    const need = brkNeed(e);
    if (e.shards >= need && e.brk < 10){
      e.shards -= need; e.brk++; brkUp = true;
      if (e.brk >= 10 && !e.awake){ e.awake = true; awake = true; }
    }
  }
  return {ok:true, id:c.id, name:c.cls, icon:c.icon, isNew, brkUp, awake};
}
function gachaTen(g){ const out=[]; for(let i=0;i<10;i++){ const r=gachaPull(g); if(!r.ok) break; out.push(r);} return out; }

function brkNeed(e){ return e.brk >= 10 ? 0 : e.brk + 2; }

// ---------- 队伍 ----------
function getTeam(g){ g = migrate(g); return g.team.map(id=>g.collection[id]).filter(Boolean); }
function toggleTeam(g, id){
  const i = g.team.indexOf(id);
  if (i >= 0){ if (g.team.length <= 1) return {ok:false,msg:'至少保留1名上阵英雄'}; g.team.splice(i,1); return {ok:true,msg:'已下阵'}; }
  if (!g.collection[id]) return {ok:false,msg:'尚未解锁该职业'};
  if (g.team.length >= 5) return {ok:false,msg:'最多上阵5名英雄'};
  g.team.push(id); return {ok:true,msg:'已上阵'};
}

// ---------- 属性 ----------
function heroStats(e){
  const c = CLASS_MAP[e.id];
  const lv = e.level - 1;
  const bm = (1 + 0.08*e.brk) * (e.awake ? 1.25 : 1);
  const s = {
    hp:   STAR_HP[c.stars.hp]  * (1+0.09*lv) * bm,
    atk:  STAR_ATK[c.stars.atk]* (1+0.07*lv) * bm,
    def:  STAR_DEF[c.stars.def]* (1+0.06*lv) * bm,
    eva:  STAR_EVA[c.stars.eva] + (e.awake ? 5 : 0),
    crit: STAR_CRIT[c.stars.crit],
    speed: 1.0,
  };
  for (const slot of ['weapon','armor','trinket']){
    const it = e.equip[slot];
    if (it){
      const m = 1 + 0.08*(it.enh||0);
      s.atk  += (it.atk  || 0)*m;
      s.hp   += (it.hp   || 0)*m;
      s.def  += (it.def  || 0)*m;
      s.crit += (it.crit || 0)*m;
      s.eva  += (it.eva  || 0)*m;
    }
  }
  s.maxhp = Math.round(s.hp);
  return s;
}
function unitPower(s){ return Math.round(s.atk*4 + s.maxhp*0.35 + s.def*2.5 + s.crit*3 + s.eva*3); }
function teamPower(g){ return getTeam(g).reduce((sum,e)=>sum+unitPower(heroStats(e)),0); }

function levelCost(level){ return Math.round(22 * Math.pow(level, 1.5)); }
function upgradeHero(g, id){
  const e = g.collection[id]; if (!e) return {ok:false,msg:'未解锁'};
  const cost = levelCost(e.level);
  if (g.gold < cost) return {ok:false, msg:'金币不足'};
  g.gold -= cost; e.level++;
  return {ok:true, msg:`升级成功！${e.nick} 现在是 ${e.level} 级`};
}
function renameHero(g, id, nick){
  const e = g.collection[id]; if (!e) return {ok:false};
  e.nick = (nick||'').trim().slice(0,8) || CLASS_MAP[id].cls;
  return {ok:true};
}

// ---------- 装备 ----------
function rollRarity(stage){
  let w = RARITY.map(r => r.w);
  w[3] += Math.min(stage*0.35, 8);
  w[0] = Math.max(w[0] - stage*0.5, 30);
  const total = w.reduce((a,b)=>a+b,0);
  let roll = Math.random()*total;
  for (let i=0;i<w.length;i++){ if (roll < w[i]) return RARITY[i]; roll -= w[i]; }
  return RARITY[0];
}

function genItem(stage, forceRarity, forceCls){
  const rarity = forceRarity || rollRarity(stage);
  const cls = forceCls || CLASSES[ri(0,4)].id;
  const slots = ['weapon','armor','trinket'];
  const slot = slots[ri(0,2)];
  const base = 4 + stage * 2.1;
  const it = { uid:_uid++, slot, cls, rarity:rarity.k, rarityName:rarity.name, color:rarity.c,
               atk:0, hp:0, def:0, crit:0, eva:0 };
  const m = rarity.mul * rnd(0.9, 1.25);
  if (slot==='weapon'){ it.atk = Math.round(base*m); if (cls==='rogue'||cls==='knight') it.crit = Math.round(rnd(4,10)*rarity.mul); }
  else if (slot==='armor'){ it.hp = Math.round(base*5.5*m); it.def = Math.round(base*0.55*m); if (cls==='rogue') it.eva = Math.round(rnd(4,8)*rarity.mul); }
  else { it.atk = Math.round(base*0.6*m); it.hp = Math.round(base*2.2*m); it.crit = Math.round(rnd(6,14)*rarity.mul); if (cls==='rogue') it.eva = Math.round(rnd(4,8)*rarity.mul); }
  const pool = CLS_ITEMS[cls][slot];
  it.name = rarity.name + '·' + pool[ri(0,pool.length-1)];
  it.power = Math.round(it.atk*4 + it.hp*0.35 + it.def*2.5 + it.crit*3 + it.eva*3);
  it.price = Math.max(5, Math.round(it.power*1.5));
  it.enh = 0;
  return it;
}

function lootFor(stage, isBoss){
  const n = isBoss ? 4 : ri(2,3);
  const items = [];
  for (let i=0;i<n;i++){
    if (isBoss && i===0) items.push(genItem(stage, RARITY[ri(2,3)]));
    else items.push(genItem(stage));
  }
  return items;
}
function goldFor(stage){ return Math.round(25 + stage*14 + rnd(0, stage*5)); }
function ticketDrops(stage, isBoss){
  let n = 0;
  if (isBoss){ n = 1 + (Math.random()<0.35?1:0); }
  else if (Math.random() < 0.03) n = 1;
  return n;
}

function equipItem(g, clsId, uid){
  const e = g.collection[clsId]; if (!e) return {ok:false, msg:'未解锁该职业'};
  const i = g.bag.findIndex(x=>x.uid===uid);
  if (i<0) return {ok:false, msg:'物品不存在'};
  const it = g.bag[i];
  if (it.cls !== clsId) return {ok:false, msg:`职业不符：${it.name} 只能给${CLASS_MAP[it.cls].cls}使用`};
  g.bag.splice(i,1);
  const old = e.equip[it.slot];
  e.equip[it.slot] = it;
  if (old) g.bag.push(old);
  return {ok:true, msg:`${it.name} 已装备`, old};
}
function autoEquip(g){
  let changed = 0;
  for (const id in g.collection){
    const e = g.collection[id];
    for (const slot of ['weapon','armor','trinket']){
      const cur = e.equip[slot];
      const best = g.bag.filter(it=>it.slot===slot && it.cls===id).sort((a,b)=>b.power-a.power)[0];
      if (best && (!cur || best.power > cur.power)){ equipItem(g, id, best.uid); changed++; }
    }
  }
  return changed;
}
function sellItem(g, uid){
  const i = g.bag.findIndex(x=>x.uid===uid);
  if (i<0) return {ok:false};
  const it = g.bag[i];
  g.bag.splice(i,1); g.gold += it.price;
  return {ok:true, msg:`出售 ${it.name}，+${it.price} 金币`};
}
function enhanceCost(it){ return Math.round(it.price*0.6*(it.enh+1)); }
function enhanceEquipped(g, clsId, slot){
  const e = g.collection[clsId];
  if (!e) return {ok:false, msg:'未解锁'};
  const it = e.equip[slot];
  if (!it) return {ok:false, msg:'该栏位没有装备'};
  if (it.enh >= 20) return {ok:false, msg:'已强化至上限'};
  const cost = enhanceCost(it);
  if (g.gold < cost) return {ok:false, msg:'金币不足'};
  g.gold -= cost; it.enh++;
  const base = it.atk*4 + it.hp*0.35 + it.def*2.5 + it.crit*3 + it.eva*3;
  it.power = Math.round(base * (1 + 0.08*it.enh));
  return {ok:true, msg:`强化成功！+${it.enh}`};
}

// ---------- 战斗 ----------
function buildFoes(stage){
  const mult = Math.pow(1.115, Math.min(stage-1, 26)) * Math.pow(1.06, Math.max(0, stage-30));
  const isBoss = stage % 5 === 0;
  const foes = [];
  if (isBoss){
    foes.push(mkFoe('ogre', stage, mult, true));
    const adds = Math.min(1 + Math.floor(stage/10), 3);
    const pool = ['orc','troll','warlock'];
    for (let i=0;i<adds;i++) foes.push(mkFoe(pool[ri(0,2)], stage, mult*0.85, false));
  } else {
    const n = Math.min(3 + Math.floor((stage-1)/3), 5);
    const pool = stage<3 ? ['orc','orc','troll'] :
                 stage<6 ? ['orc','troll','warlock'] : ['orc','troll','warlock','troll'];
    for (let i=0;i<n;i++) foes.push(mkFoe(pool[ri(0,pool.length-1)], stage, mult, false));
  }
  return foes;
}
function mkFoe(kind, stage, mult, isBoss){
  const d = FOE_DEFS[kind];
  return { foe:true, side:1, kind, name: d.name + (isBoss?'·首领':''), icon: d.icon,
    maxhp: Math.round(d.hp*mult), hp: Math.round(d.hp*mult), atk: d.atk*mult, def: d.def*mult,
    eva: d.eva||0, crit: d.crit, speed: d.speed, skill: d.skill, role:'foe' };
}
function foesPower(stage){
  return buildFoes(stage).reduce((s,f)=>s+Math.round(f.atk*4+f.maxhp*0.35+f.def*2.5+f.crit*3),0);
}

function buildHeroUnits(heroList, side){
  return heroList.map(e=>{
    const c = CLASS_MAP[e.id];
    const s = heroStats(e);
    return { name:e.nick || c.cls, icon:c.icon, cls:c.cls, role:c.role, skillName:c.skillName,
             maxhp:s.maxhp, hp:s.maxhp, atk:s.atk, def:s.def, eva:s.eva, crit:s.crit,
             speed:s.speed, side: side||0 };
  });
}

function simulateBattle(g, stage){
  return runBattle(buildHeroUnits(getTeam(g), 0), buildFoes(stage));
}
function makeSnapshot(g){
  g = migrate(g);
  return { team: JSON.parse(JSON.stringify(getTeam(g))), power: teamPower(g) };
}
function simulateArena(attackGame, defTeam){
  return runBattle(buildHeroUnits(getTeam(attackGame), 0), buildHeroUnits(defTeam, 1));
}

function runBattle(allies, foes){
  const units = allies.concat(foes).map((u,i)=>({ ...u, idx:i, energy:0, timer:rnd(0,0.8), shield:0, taunt:0, alive:true }));
  const events = [];
  let t = 0; const dt = 0.25;
  const atkInterval = u => 2.2 / u.speed;

  function deal(src, tgt, mult, bonusCrit){
    if (tgt.eva && Math.random()*100 < tgt.eva){
      events.push({t, k:'miss', s:src.idx, g:tgt.idx});
      return 0;
    }
    let raw = src.atk * mult * rnd(0.9,1.1);
    let crit = Math.random()*100 < (src.crit + (bonusCrit||0));
    if (crit) raw *= 2;
    let dmg = Math.max(1, Math.round(raw - tgt.def*0.55));
    if (tgt.shield > 0){
      const absorbed = Math.min(tgt.shield, dmg);
      tgt.shield -= absorbed; dmg -= absorbed;
    }
    tgt.hp -= dmg;
    events.push({t, k:'hit', s:src.idx, g:tgt.idx, d:dmg, c:crit});
    if (tgt.hp <= 0 && tgt.alive){ tgt.alive=false; events.push({t, k:'die', g:tgt.idx}); }
    return dmg;
  }
  function heal(src, tgt, mult){
    const v = Math.round(src.atk * mult * rnd(0.95,1.1));
    const before = tgt.hp;
    tgt.hp = Math.min(tgt.maxhp, tgt.hp + v);
    events.push({t, k:'heal', s:src.idx, g:tgt.idx, d:tgt.hp-before});
  }
  function pickTarget(src){
    const foesAlive = units.filter(u=>u.alive && u.side!==src.side);
    if (!foesAlive.length) return null;
    if (src.side===1){
      const tanks = foesAlive.filter(u=>u.role==='tank');
      if (tanks.length && (Math.random()<0.78 || src.taunt>0)) return tanks[ri(0,tanks.length-1)];
    }
    return foesAlive[ri(0,foesAlive.length-1)];
  }

  let winner = -1;
  while (t < 120){
    t += dt;
    for (const u of units){
      if (!u.alive) continue;
      if (u.taunt>0) u.taunt -= dt;
      u.timer += dt;
      if (u.timer >= atkInterval(u)){
        u.timer = 0;
        u.energy = Math.min(100, u.energy + 26);
        const tgt = pickTarget(u);
        if (tgt) deal(u, tgt, 1);
      }
      if (u.energy >= 100 && u.alive){
        u.energy = 0;
        events.push({t, k:'skill', s:u.idx, name:u.skillName});
        if (u.skillName === '盾墙'){
          u.shield = Math.round(u.maxhp*0.3);
          u.taunt = 6;
          units.forEach(x=>{ if(x.alive && x.side===1) x.taunt = 6; });
          events.push({t, k:'buff', g:u.idx, name:'嘲讽！'});
        } else if (u.skillName === '治疗术'){
          const mates = units.filter(x=>x.alive && x.side===u.side);
          const low = mates.sort((a,b)=>(a.hp/a.maxhp)-(b.hp/b.maxhp))[0];
          if (low) heal(u, low, 3.6);
        } else if (u.skillName === '烈焰风暴'){
          units.filter(x=>x.alive && x.side!==u.side).forEach(f=>deal(u,f,1.65));
        } else if (u.skillName === '顺劈斩'){
          const tgt = pickTarget(u); if (tgt) deal(u, tgt, 2.5);
        } else if (u.skillName === '暗影打击'){
          const tgt = pickTarget(u); if (tgt) deal(u, tgt, 3.0, 35);
        } else if (u.skill === 'bolt'){
          const tgt = pickTarget(u); if (tgt) deal(u, tgt, 1.9);
        } else if (u.skill === 'double'){
          const tgt = pickTarget(u);
          if (tgt){ deal(u, tgt, 0.65); if (tgt.alive) deal(u, tgt, 0.65); }
        } else if (u.skill === 'smash'){
          const tgt = pickTarget(u); if (tgt) deal(u, tgt, 1.7);
        } else if (u.skill === 'quake'){
          units.filter(x=>x.alive && x.side!==u.side).forEach(f=>deal(u,f,1.15));
        }
      }
    }
    if (!units.some(u=>u.alive && u.side===0)){ winner = 1; break; }
    if (!units.some(u=>u.alive && u.side===1)){ winner = 0; break; }
  }
  if (winner===-1) winner = units.filter(u=>u.side===0&&u.alive).length >= units.filter(u=>u.side===1&&u.alive).length ? 0 : 1;

  return { win: winner===0, time: t, events,
    units: units.map(u=>({ idx:u.idx, name:u.name, icon:u.icon, side:u.side, maxhp:u.maxhp, hp:Math.max(0,Math.round(u.hp)) })) };
}

function stageName(stage){
  const chapters = ['影牙森林','枯骨矿洞','哀嚎沼泽','烈日荒漠','寒冰王座'];
  const ch = Math.floor((stage-1)/10);
  const name = chapters[Math.min(ch, chapters.length-1)];
  return `第${stage}关 · ${name}`;
}

if (typeof module !== 'undefined') module.exports = {CLASSES, CLASS_MAP, newGame, migrate, gachaPull, gachaTen, brkNeed, getTeam, toggleTeam, heroStats, unitPower, teamPower, levelCost, upgradeHero, renameHero, genItem, lootFor, goldFor, ticketDrops, equipItem, autoEquip, sellItem, enhanceCost, enhanceEquipped, buildFoes, foesPower, buildHeroUnits, simulateBattle, makeSnapshot, simulateArena, runBattle, stageName, RARITY, SLOT_NAMES};

if (typeof module !== 'undefined') module.exports = {CLASSES, CLASS_MAP, newGame, migrate, gachaPull, gachaTen, brkNeed, getTeam, toggleTeam, heroStats, unitPower, teamPower, levelCost, upgradeHero, renameHero, genItem, lootFor, goldFor, ticketDrops, equipItem, autoEquip, sellItem, enhanceCost, enhanceEquipped, buildFoes, foesPower, buildHeroUnits, simulateBattle, makeSnapshot, simulateArena, runBattle, stageName, RARITY, SLOT_NAMES};
