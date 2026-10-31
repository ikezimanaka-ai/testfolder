const SUITS = ['man', 'pin', 'sou'];
const HONOR_NAMES = ['東', '南', '西', '北', '白', '發', '中'];
const key = tile => `${tile.suit}:${tile.rank}`;
const asIndex = tile => tile.suit === 'ji'
  ? 27 + tile.rank - 1
  : SUITS.indexOf(tile.suit) * 9 + tile.rank - 1;
const fromIndex = index => index >= 27
  ? { suit: 'ji', rank: index - 27 + 1 }
  : { suit: SUITS[Math.floor(index / 9)], rank: index % 9 + 1 };

function countTiles(tiles) {
  const counts = Array(34).fill(0);
  for (const tile of tiles) {
    const index = asIndex(tile);
    if (index < 0 || index >= 34 || !Number.isInteger(tile.rank)) return null;
    counts[index] += 1;
    if (counts[index] > 4) return null;
  }
  return counts;
}

function isSequence(group) { return group.type === 'sequence'; }
function groupTriplet(group) { return group.type === 'triplet' || group.type === 'kan'; }
function terminalOrHonor(tile) { return tile.suit === 'ji' || tile.rank === 1 || tile.rank === 9; }
function simple(tile) { return tile.suit !== 'ji' && tile.rank > 1 && tile.rank < 9; }

function splitNormalHand(tiles, melds = []) {
  const meldCount = melds.length;
  const counts = countTiles(tiles);
  if (!counts || tiles.length !== 14 - meldCount * 3) return [];
  const results = [];
  for (let pair = 0; pair < 34; pair += 1) {
    if (counts[pair] < 2) continue;
    counts[pair] -= 2;
    const groups = [];
    const collect = () => {
      const index = counts.findIndex(n => n > 0);
      if (index < 0) {
        if (groups.length === 4 - meldCount) results.push({ pair, groups: groups.map(group => ({ ...group })) });
        return;
      }
      if (groups.length >= 4 - meldCount) return;
      if (counts[index] >= 3) {
        counts[index] -= 3; groups.push({ type: 'triplet', index }); collect(); groups.pop(); counts[index] += 3;
      }
      if (index < 27 && index % 9 <= 6 && counts[index + 1] && counts[index + 2]) {
        counts[index] -= 1; counts[index + 1] -= 1; counts[index + 2] -= 1;
        groups.push({ type: 'sequence', index }); collect(); groups.pop();
        counts[index] += 1; counts[index + 1] += 1; counts[index + 2] += 1;
      }
    };
    collect();
    counts[pair] += 2;
  }
  return results;
}

function isSevenPairs(tiles) {
  const counts = countTiles(tiles);
  return Boolean(counts && tiles.length === 14 && counts.filter(count => count === 2).length === 7 && counts.every(count => count === 0 || count === 2));
}

function isThirteenOrphans(tiles) {
  const counts = countTiles(tiles);
  if (!counts || tiles.length !== 14) return false;
  const orphans = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  return orphans.every(index => counts[index] > 0) && orphans.some(index => counts[index] === 2) &&
    counts.every((count, index) => !count || orphans.includes(index));
}

function waitsFor(tiles, melds = []) {
  const result = [];
  for (let index = 0; index < 34; index += 1) {
    const tile = fromIndex(index);
    const existing = tiles.filter(item => asIndex(item) === index).length;
    if (existing >= 4) continue;
    const candidate = [...tiles, tile];
    if (splitNormalHand(candidate, melds).length || (!melds.length && (isSevenPairs(candidate) || isThirteenOrphans(candidate)))) result.push(key(tile));
  }
  return result;
}

function meldGroups(state, playerId) {
  const tiles = state.mahjongTiles.filter(tile => tile.zone === 'meld' && tile.ownerId === playerId);
  const groups = new Map();
  for (const tile of tiles) {
    const id = tile.meldId || `${tile.meldKind}:${tile.suit}:${tile.rank}:${tile.id}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(tile);
  }
  return [...groups.values()].map(tilesInGroup => {
    const tile = tilesInGroup[0];
    const kind = tile.meldKind || (tilesInGroup.length === 4 ? 'kan' : 'pon');
    return {
      type: kind === 'chi' ? 'sequence' : 'triplet',
      index: kind === 'chi' ? Math.min(...tilesInGroup.map(asIndex)) : asIndex(tile),
      suit: tile.suit,
      rank: tile.rank,
      count: tilesInGroup.length,
      open: tilesInGroup.some(item => item.called) || !String(kind).includes('ankan'),
      kind
    };
  });
}

function pairFu(pair, game, playerId) {
  if (pair >= 31) return 2;
  if (pair < 27) return 0;
  const seatWind = game.seatWindByPlayer?.[playerId] ?? 0;
  const roundWind = game.roundWindIndex ?? 0;
  const isSeat = pair === 27 + seatWind;
  const isRound = pair === 27 + roundWind;
  if (isSeat && isRound) return 2;
  return isSeat || isRound ? 2 : 0;
}

function winningWaitType(groups, pair, winTileIndex) {
  if (pair === winTileIndex) return 'tanki';
  for (const group of groups) {
    if (group.type === 'triplet' && group.index === winTileIndex) return 'shanpon';
    if (group.type !== 'sequence' || winTileIndex < group.index || winTileIndex > group.index + 2) continue;
    const position = winTileIndex - group.index;
    if (position === 1) return 'kanchan';
    if ((position === 0 && group.index % 9 === 0) || (position === 2 && group.index % 9 === 6)) return 'penchan';
    return 'ryanmen';
  }
  return 'unknown';
}

function closedGroups(state, playerId, concealedGroups) {
  return [...meldGroups(state, playerId), ...concealedGroups.map(group => ({ ...group, open: false, count: 3 }))];
}

function yakuFor(state, playerId, concealed, melds, split, winKind, winTile) {
  const game = state.mahjongGame || {};
  const groups = closedGroups(state, playerId, split.groups);
  const allTiles = [...concealed, ...state.mahjongTiles.filter(tile => tile.zone === 'meld' && tile.ownerId === playerId)];
  const closed = melds.every(meld => !meld.open);
  const wait = winningWaitType(split.groups, split.pair, asIndex(winTile));
  const triplets = groups.filter(groupTriplet);
  const sequences = groups.filter(isSequence);
  const yaku = [];
  const add = (name, han, yakuman = 0) => yaku.push({ name, han, yakuman });
  const suitTiles = allTiles.filter(tile => tile.suit !== 'ji');
  const hasHonor = allTiles.some(tile => tile.suit === 'ji');
  const hasTerminal = allTiles.some(terminalOrHonor);
  const allSimple = allTiles.every(simple);
  const counts = countTiles(allTiles) || [];
  const windTriplets = [27, 28, 29, 30].filter(index => counts[index] >= 3);
  const dragonTriplets = [31, 32, 33].filter(index => counts[index] >= 3);
  const seatWindIndex = 27 + (game.seatWindByPlayer?.[playerId] ?? 0);
  const roundWindIndex = 27 + (game.roundWindIndex ?? 0);
  const pairValue = pairFu(split.pair, game, playerId) > 0;

  if (game.mahjongPlayers?.[playerId]?.doubleRiichi) add('ダブル立直', 2);
  else if (game.mahjongPlayers?.[playerId]?.riichi) add('立直', 1);
  if (game.mahjongPlayers?.[playerId]?.ippatsu) add('一発', 1);
  if (winKind === 'tsumo' && closed) add('門前清自摸和', 1);
  if (allSimple) add('断么九', 1);
  if (dragonTriplets.length) add('役牌（三元牌）', dragonTriplets.length);
  if (windTriplets.includes(seatWindIndex)) add('役牌（自風）', 1);
  if (windTriplets.includes(roundWindIndex)) add('役牌（場風）', 1);
  if (winKind === 'tsumo' && game.rinshanWinBy === playerId) add('嶺上開花', 1);
  if (winKind === 'ron' && game.chankanBy === playerId) add('槍槓', 1);
  if (winKind === 'tsumo' && game.liveWallRemaining === 0) add('海底摸月', 1);
  if (winKind === 'ron' && game.lastDiscardFromLastLiveTile) add('河底撈魚', 1);

  if (closed && isSevenPairs(concealed)) add('七対子', 2);
  if (closed && split.groups.every(isSequence) && !pairValue && wait === 'ryanmen') add('平和', 1);
  if (closed) {
    const sequenceKeys = split.groups.filter(isSequence).map(group => `${Math.floor(group.index / 9)}:${group.index % 9}`).sort();
    if (new Set(sequenceKeys).size < sequenceKeys.length) {
      const duplicatePairs = sequenceKeys.length - new Set(sequenceKeys).size;
      if (duplicatePairs >= 2) add('二盃口', 3);
      else add('一盃口', 1);
    }
  }
  if (triplets.length === groups.length) add('対々和', 2);
  const concealedTriplets = triplets.filter(group => !group.open && !(winKind === 'ron' && group.index === asIndex(winTile))).length;
  if (concealedTriplets >= 3) add('三暗刻', 2);
  if (melds.filter(meld => meld.count === 4).length >= 3) add('三槓子', 2);
  if (dragonTriplets.length === 2 && split.pair >= 31) add('小三元', 2);

  const sequenceStarts = split.groups.filter(isSequence).map(group => group.index);
  const suits = new Set(suitTiles.map(tile => tile.suit));
  const allSetGroups = groups;
  for (const suit of SUITS) {
    const starts = [0, 3, 6].map(offset => SUITS.indexOf(suit) * 9 + offset);
    if (starts.every(start => sequenceStarts.includes(start))) add('一気通貫', closed ? 2 : 1);
  }
  for (let rank = 0; rank <= 6; rank += 1) {
    const starts = SUITS.map((_, suitIndex) => suitIndex * 9 + rank);
    if (starts.every(start => sequenceStarts.includes(start))) add('三色同順', closed ? 2 : 1);
  }
  if (SUITS.every(suit => triplets.some(group => group.index < 27 && Math.floor(group.index / 9) === SUITS.indexOf(suit)))) {
    for (let rank = 0; rank < 9; rank += 1) {
      if (SUITS.every((_, suitIndex) => triplets.some(group => group.index === suitIndex * 9 + rank))) add('三色同刻', 2);
    }
  }
  if (suits.size === 1 && suitTiles.length === allTiles.length) add('清一色', closed ? 6 : 5);
  else if (suits.size === 1 && hasHonor) add('混一色', closed ? 3 : 2);
  const groupHasTerminal = group => group.type === 'sequence'
    ? group.index % 9 === 0 || group.index % 9 === 6
    : terminalOrHonor(fromIndex(group.index));
  if (hasTerminal && groups.every(groupHasTerminal) && terminalOrHonor(fromIndex(split.pair))) {
    if (hasHonor && sequences.length) add('混全帯么九', closed ? 2 : 1);
    else if (hasHonor && !sequences.length) add('混老頭', 2);
    else if (!hasHonor && !sequences.length) add('清老頭', 0, 1);
    else if (sequences.length) add('純全帯么九', closed ? 3 : 2);
  }
  if (allTiles.every(tile => tile.suit === 'ji')) add('字一色', 0, 1);
  if (allTiles.every(tile => tile.suit === 'ji' ? tile.rank === 6 : tile.suit === 'sou' && [2, 3, 4, 6, 8].includes(tile.rank))) add('緑一色', 0, 1);
  if (dragonTriplets.length === 3) add('大三元', 0, 1);
  if (windTriplets.length === 4) add('大四喜', 0, 2);
  else if (windTriplets.length === 3 && split.pair >= 27 && split.pair <= 30) add('小四喜', 0, 1);
  if (melds.filter(meld => meld.count === 4).length + split.groups.filter(group => group.type === 'kan').length === 4) add('四槓子', 0, 1);
  if (closed && triplets.length === 4 && concealedTriplets === 4) add('四暗刻', 0, 1);
  if (closed && isThirteenOrphans(concealed)) {
    add('国士無双', 0, 1);
  }
  if (closed && allTiles.length === 14 && suitTiles.length === 14 && suits.size === 1) {
    const suit = [...suits][0];
    const suitOffset = SUITS.indexOf(suit) * 9;
    const base = [3, 1, 1, 1, 1, 1, 1, 1, 3];
    if (counts.slice(suitOffset, suitOffset + 9).every((count, index) => count >= base[index])) {
      add('九蓮宝燈', 0, 1);
    }
  }
  if (game.tenhouWinnerId === playerId) add('天和', 0, 1);
  if (game.chiihouWinnerId === playerId) add('地和', 0, 1);

  const yakuHan = yaku.reduce((sum, item) => sum + item.han, 0);
  const yakuman = yaku.reduce((sum, item) => sum + item.yakuman, 0);
  if (game.mahjongPlayers?.[playerId]?.riichi) {
    const doraCount = countDora(state, allTiles, playerId);
    if (doraCount) yaku.push({ name: 'ドラ', han: doraCount, yakuman: 0 });
  } else {
    const doraCount = countDora(state, allTiles, playerId);
    if (doraCount) yaku.push({ name: 'ドラ', han: doraCount, yakuman: 0 });
  }
  const totalHan = yaku.reduce((sum, item) => sum + item.han, 0);
  const fu = calculateFu(state, playerId, concealed, melds, split, winKind, winTile, wait, closed, allTiles);
  return { yaku, han: totalHan, baseHan: yakuHan, yakuman, fu, closed, wait, groups, pair: split.pair };
}

function doraIndex(indicator) {
  if (indicator < 27) {
    const suitStart = Math.floor(indicator / 9) * 9;
    return suitStart + ((indicator - suitStart + 1) % 9);
  }
  if (indicator <= 30) return 27 + ((indicator - 27 + 1) % 4);
  return 31 + ((indicator - 31 + 1) % 3);
}

function countDora(state, tiles, playerId) {
  const game = state.mahjongGame || {};
  let indicators = game.doraIndicators || [];
  if (game.mahjongPlayers?.[playerId]?.riichi) indicators = [...indicators, ...(game.uraDoraIndicators || [])];
  const doraCounts = new Map();
  for (const id of indicators) {
    const tile = state.mahjongTiles.find(item => item.id === id);
    if (tile) {
      const target = doraIndex(asIndex(tile));
      doraCounts.set(target, (doraCounts.get(target) || 0) + 1);
    }
  }
  return tiles.reduce((sum, tile) => sum + (doraCounts.get(asIndex(tile)) || 0), 0);
}

function calculateFu(state, playerId, concealed, melds, split, winKind, winTile, wait, closed, allTiles) {
  if (isSevenPairs(concealed)) return 25;
  if (closed && split.groups.every(isSequence) && pairFu(split.pair, state.mahjongGame, playerId) === 0 && wait === 'ryanmen' && winKind === 'tsumo') return 20;
  let fu = 20;
  if (winKind === 'tsumo') fu += 2;
  else if (closed) fu += 10;
  fu += pairFu(split.pair, state.mahjongGame, playerId);
  if (['tanki', 'kanchan', 'penchan'].includes(wait)) fu += 2;
  for (const group of split.groups) {
    if (group.type !== 'triplet' && group.type !== 'kan') continue;
    const tile = fromIndex(group.index);
    const terminal = terminalOrHonor(tile);
    const concealedTriplet = group.index !== asIndex(winTile) || winKind === 'tsumo';
    fu += group.type === 'kan'
      ? terminal ? (concealedTriplet ? 32 : 16) : (concealedTriplet ? 16 : 8)
      : terminal ? (concealedTriplet ? 8 : 4) : (concealedTriplet ? 4 : 2);
  }
  for (const meld of melds) {
    if (!groupTriplet(meld)) continue;
    const terminal = terminalOrHonor({ suit: meld.suit, rank: meld.rank });
    fu += meld.count === 4
      ? terminal ? (meld.open ? 16 : 32) : (meld.open ? 8 : 16)
      : terminal ? (meld.open ? 4 : 8) : (meld.open ? 2 : 4);
  }
  if (fu === 20 && winKind === 'ron') fu = 30;
  return Math.ceil(fu / 10) * 10;
}

export function basePoints(han, fu, yakuman = 0) {
  if (yakuman) return 8000 * yakuman;
  if (han <= 0) return 0;
  if ((han === 4 && fu === 30) || (han === 3 && fu === 60)) return 2000; // WRC kiriage mangan.
  const raw = fu * 2 ** (han + 2);
  if (han >= 13) return 8000; // WRC 2025 caps non-yakuman hands at yonbaiman.
  if (han >= 11 || raw >= 6000) return 6000;
  if (han >= 8 || raw >= 4000) return 4000;
  if (han >= 6 || raw >= 3000) return 3000;
  if (han >= 5 || raw >= 2000) return 2000;
  return raw;
}

function round100(value) { return Math.ceil(value / 100) * 100; }

export function mahjongMelds(state, playerId) { return meldGroups(state, playerId); }

export function mahjongWaits(state, playerId, tiles = null) {
  const hand = tiles || state.mahjongTiles.filter(tile => tile.zone === 'hand' && tile.ownerId === playerId);
  return waitsFor(hand, meldGroups(state, playerId));
}

export function evaluateMahjongWin(state, playerId, winKind, winningTile = null) {
  const game = state.mahjongGame;
  const hand = state.mahjongTiles.filter(tile => tile.zone === 'hand' && tile.ownerId === playerId);
  const melds = meldGroups(state, playerId);
  if (hand.length !== 13 - melds.length * 3) return null;
  const tiles = winningTile ? [...hand, winningTile] : hand;
  if (isThirteenOrphans(tiles) && !melds.length) {
    const discard = winKind === 'ron' ? winningTile || state.mahjongTiles.find(tile => tile.id === game.lastDiscardId) : null;
    const yaku=[{name:'国士無双',han:0,yakuman:1}];
    if(game.tenhouWinnerId===playerId)yaku.push({name:'天和',han:0,yakuman:1});
    if(game.chiihouWinnerId===playerId)yaku.push({name:'地和',han:0,yakuman:1});
    const yakuman=yaku.reduce((sum,item)=>sum+item.yakuman,0);const base=8000*yakuman; const dealer = game.dealerId === playerId; const payments = {};
    if (winKind === 'ron') payments[discard.ownerId] = round100(base * (dealer ? 6 : 4)) + (game.honba || 0) * 300;
    else for (const id of game.playerIds) if (id !== playerId) payments[id] = round100(base * (dealer || game.dealerId === id ? 2 : 1)) + (game.honba || 0) * 100;
    return { yaku,han:0,fu:0,yakuman,closed:true,wait:'unknown',groups:[],pair:null,basePoints:base,payments,winnerGetsSticks:(game.riichiSticks||0)*1000,fromId:discard?.ownerId };
  }
  const splits = splitNormalHand(tiles, melds);
  const candidates = [];
  for (const split of splits) candidates.push(yakuFor(state, playerId, tiles, melds, split, winKind, winningTile || tiles.at(-1)));
  const noCallsOrKans = !game.callMade && !game.kanDeclared && !melds.length;
  const renhou = winKind === 'ron' && game.dealerId !== playerId && noCallsOrKans &&
    !(game.drawCountByPlayer?.[playerId] || 0);
  if (renhou && splits.length) candidates.push({ yaku:[{name:'人和',han:5,yakuman:0}],han:5,baseHan:5,yakuman:0,fu:0,closed:true,wait:'unknown',groups:[],pair:null });
  if (!melds.length && isSevenPairs(tiles)) candidates.push({ yaku: [{ name: '七対子', han: 2, yakuman: 0 }], han: 2, baseHan: 2, fu: 25, yakuman: 0, closed: true, wait: 'tanki', groups: [], pair: null });
  const legal = candidates.filter(result => result.yakuman > 0 || result.baseHan > 0);
  if (!legal.length) return null;
  legal.sort((a, b) => basePoints(b.han, b.fu, b.yakuman) - basePoints(a.han, a.fu, a.yakuman));
  const best = legal[0];
  const base = basePoints(best.han, best.fu, best.yakuman);
  const dealer = game.dealerId === playerId;
  const payments = {};
  if (winKind === 'ron') {
    const discard = winningTile || state.mahjongTiles.find(tile => tile.id === game.lastDiscardId);
    payments[discard.ownerId] = round100(base * (dealer ? 6 : 4)) + (game.honba || 0) * 300;
    best.fromId = discard.ownerId;
  } else {
    for (const id of game.playerIds) {
      if (id === playerId) continue;
      payments[id] = round100(base * (dealer || game.dealerId === id ? 2 : 1)) + (game.honba || 0) * 100;
    }
  }
  best.basePoints = base;
  best.payments = payments;
  best.winnerGetsSticks = (game.riichiSticks || 0) * 1000;
  best.totalHan = best.han;
  return best;
}

export function isMahjongTenpai(state, playerId, discardTileId) {
  const hand = state.mahjongTiles.filter(tile => tile.zone === 'hand' && tile.ownerId === playerId && tile.id !== discardTileId);
  return mahjongWaits(state, playerId, hand).length > 0;
}
