const copy = value => JSON.parse(JSON.stringify(value));

function tileKey(tile) { return `${tile.suit}:${tile.rank}`; }
function countsFor(tiles) {
  const counts = new Map();
  for (const tile of tiles) counts.set(tileKey(tile), (counts.get(tileKey(tile)) || 0) + 1);
  return counts;
}
function standardWin(tiles, openMelds = 0) {
  if (tiles.length !== 14 - openMelds * 3) return false;
  const counts = countsFor(tiles);
  for (const [key, count] of counts) {
    if (count < 2) continue;
    const rest = new Map(counts); rest.set(key, count - 2);
    const groups = openMelds;
    const consume = (map, needed) => {
      const entry = [...map].find(([, n]) => n > 0);
      if (!entry) return needed === 0;
      if (needed <= 0) return false;
      const [id, n] = entry;
      if (n >= 3) { map.set(id, n - 3); if (consume(map, needed - 1)) return true; map.set(id, n); }
      const [suit, rankText] = id.split(':'); const rank = Number(rankText);
      if (suit !== 'ji' && rank <= 7 && map.get(`${suit}:${rank + 1}`) && map.get(`${suit}:${rank + 2}`)) {
        map.set(id, n - 1); map.set(`${suit}:${rank + 1}`, map.get(`${suit}:${rank + 1}`) - 1); map.set(`${suit}:${rank + 2}`, map.get(`${suit}:${rank + 2}`) - 1);
        if (consume(map, needed - 1)) return true;
        map.set(id, n); map.set(`${suit}:${rank + 1}`, map.get(`${suit}:${rank + 1}`) + 1); map.set(`${suit}:${rank + 2}`, map.get(`${suit}:${rank + 2}`) + 1);
      }
      return false;
    };
    if (consume(rest, 4 - groups)) return true;
  }
  return tiles.length === 14 && [...counts.values()].sort((a,b)=>a-b).join(',') === '2,2,2,2,2,2,2';
}
function hasYaku(tiles, meldCount, winKind, game, winnerId, state) {
  const melds = state.mahjongTiles.filter(t => t.zone === 'meld' && t.ownerId === winnerId);
  const all = [...tiles, ...melds];
  const simple = t => t.suit !== 'ji' && t.rank > 1 && t.rank < 9;
  const counts = countsFor(all);
  const tanyao = all.every(simple);
  const yakuhai = [...counts].some(([k,n]) => k.startsWith('ji:') && n >= 3);
  const pinfu = meldCount === 0 && all.every(simple) && [...counts.values()].filter(n=>n===2).length === 1;
  const sevenPairs = tiles.length === 14 && [...countsFor(tiles).values()].sort((a,b)=>a-b).join(',') === '2,2,2,2,2,2,2';
  const riichi = Boolean(game.mahjongPlayers?.[winnerId]?.riichi);
  const closed = meldCount === 0;
  return riichi || (winKind === 'tsumo' && closed) || tanyao || yakuhai || pinfu || sevenPairs;
}

function reversiLegal(board, color) {
  const moves = [];
  for (let y=0;y<8;y++) for (let x=0;x<8;x++) {
    if (board[y][x]) continue;
    const flips=[];
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
      if(!dx&&!dy) continue; const line=[]; let cx=x+dx,cy=y+dy;
      while(cx>=0&&cx<8&&cy>=0&&cy<8&&board[cy][cx]&&board[cy][cx]!==color){line.push([cx,cy]);cx+=dx;cy+=dy;}
      if(line.length&&cx>=0&&cx<8&&cy>=0&&cy<8&&board[cy][cx]===color) flips.push(...line);
    }
    if(flips.length) moves.push({x,y,flips});
  }
  return moves;
}
function secureRandomIndex(limit) {
  if (globalThis.crypto?.getRandomValues) {
    const range = 0x100000000;
    const ceiling = Math.floor(range / limit) * limit;
    const sample = new Uint32Array(1);
    do { globalThis.crypto.getRandomValues(sample); } while (sample[0] >= ceiling);
    return sample[0] % limit;
  }
  return Math.floor(Math.random() * limit);
}
export function shufflePokerDeck(deck, randomIndex = secureRandomIndex) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
const pokerDeck = () => shufflePokerDeck(
  ['s','h','d','c'].flatMap(suit => Array.from({length:13},(_,i)=>({id:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`,suit,rank:i+1})))
);
function rankFive(cards) {
  const values=cards.map(c=>c.rank===1?14:c.rank).sort((a,b)=>b-a), counts=new Map(); values.forEach(v=>counts.set(v,(counts.get(v)||0)+1));
  const groups=[...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]), flush=cards.every(c=>c.suit===cards[0].suit);
  const unique=[...new Set(values)], straight=unique.length===5&&(unique[0]-unique[4]===4||unique.join(',')==='14,5,4,3,2'), high=unique.join(',')==='14,5,4,3,2'?5:unique[0];
  if(flush&&straight)return [8,high]; if(groups[0][1]===4)return [7,groups[0][0],groups[1][0]];
  if(groups[0][1]===3&&groups[1][1]===2)return [6,groups[0][0],groups[1][0]];
  if(flush)return [5,...values]; if(straight)return [4,high];
  if(groups[0][1]===3)return [3,groups[0][0],...groups.slice(1).map(g=>g[0]).sort((a,b)=>b-a)];
  if(groups[0][1]===2&&groups[1][1]===2)return [2,groups[0][0],groups[1][0],groups[2][0]];
  if(groups[0][1]===2)return [1,groups[0][0],...groups.slice(1).map(g=>g[0]).sort((a,b)=>b-a)]; return [0,...values];
}
const HAND_NAMES = ['ハイカード','ワンペア','ツーペア','スリーカード','ストレート','フラッシュ','フルハウス','フォーカード','ストレートフラッシュ'];
function bestHand(cards) {
  let best=null; for(let a=0;a<cards.length-4;a++)for(let b=a+1;b<cards.length-3;b++)for(let c=b+1;c<cards.length-2;c++)for(let d=c+1;d<cards.length-1;d++)for(let e=d+1;e<cards.length;e++){
    const score=rankFive([cards[a],cards[b],cards[c],cards[d],cards[e]]);if(!best||score.some((v,i)=>v>(best[i]||0)&&score.slice(0,i).every((n,j)=>n===best[j])))best=score;
  } return best||[];
}
function compareScore(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){if((a[i]||0)!==(b[i]||0))return (a[i]||0)-(b[i]||0);}return 0;}
function nextActive(game, from, predicate=()=>true){for(let i=1;i<=game.players.length;i++){const n=(from+i)%game.players.length;if(!game.folded.includes(game.players[n])&&predicate(game.players[n]))return n;}return null;}
function finishPoker(game){
  const live=game.players.filter(id=>!game.folded.includes(id)); if(live.length===1){game.winnerId=live[0];game.winners=live;game.status='finished';game.chips[live[0]]+=game.pot;game.awarded=game.pot;game.message='全員がフォールドしました。';return;}
  const scores=Object.fromEntries(live.map(id=>[id,bestHand(game.mode==='holdem'?[...game.hands[id],...game.community]:game.hands[id])]));
  const winners=live.filter(id=>live.every(other=>compareScore(scores[id],scores[other])>=0)); game.winnerId=winners.length===1?winners[0]:null;game.winners=winners;game.status='finished';
  game.handRanks=Object.fromEntries(Object.entries(scores).map(([id,score])=>[id,HAND_NAMES[score[0]]||'']));
  if(game.mode==='holdem') {const share=Math.floor(game.pot/winners.length);winners.forEach(id=>game.chips[id]+=share);game.awarded=share*winners.length;}
  game.message=winners.length===1?`${game.handRanks[winners[0]]}で勝者が決まりました。`:`${game.handRanks[winners[0]]}で引き分けです。`;
}
function newPokerGame(state, mode){
  const players=state.players.filter(p=>!p.spectator);if(players.length<2||players.length>8)throw new Error('ポーカーは2〜8人で遊べます。');
  const deck=pokerDeck(), ids=players.map(p=>p.id), hands=Object.fromEntries(ids.map(id=>[id,[]]));
  const rounds=mode==='draw-poker'?5:2; for(let n=0;n<rounds;n++)for(const id of ids)hands[id].push(deck.pop());
  const chips=Object.fromEntries(ids.map(id=>[id,500])); const game={mode,variant:mode==='holdem'?'テキサスホールデム':'5枚ドローポーカー',status:'playing',players:ids,current:0,hands,deck,community:[],chips,contrib:Object.fromEntries(ids.map(id=>[id,0])),folded:[],pot:0,message:'',round:mode==='holdem'?'preflop':'draw',selected:[],discarded:[],exchanged:[]};
  if(mode==='holdem'){game.pending=ids.slice();game.toCall=0;}
  game.message=`${players[0].name}から開始。`;
  if(mode==='holdem'){const small=ids[0],big=ids[1];game.chips[small]-=10;game.contrib[small]=10;game.chips[big]-=20;game.contrib[big]=20;game.pot=30;game.toCall=20;game.pending=ids.slice();game.current=ids.length===2?0:2%ids.length;}
  return game;
}
function pokerAction(game, action, actorId){
  if(game.status!=='playing'||game.players[game.current]!==actorId)throw new Error('ポーカーの順番ではありません。');
  if(game.mode==='draw-poker'){
    if(game.round==='draw'){
      if(action.kind!=='draw'||!Array.isArray(action.cardIds)||action.cardIds.length>5)throw new Error('交換するカードを選んでください。');
      const hand=game.hands[actorId]; if(new Set(action.cardIds).size!==action.cardIds.length||action.cardIds.some(id=>!hand.some(c=>c.id===id)))throw new Error('選択カードが手札にありません。');
      if(action.cardIds.length>game.deck.length)throw new Error(`山札は残り${game.deck.length}枚です。交換枚数を減らしてください。`);
      const discard=hand.filter(c=>action.cardIds.includes(c.id)); game.discarded.push(...discard); game.hands[actorId]=hand.filter(c=>!action.cardIds.includes(c.id));
      for(let n=0;n<discard.length;n++)game.hands[actorId].push(game.deck.pop()); game.exchanged.push(actorId); game.current++;
      if(game.current>=game.players.length){game.current=0;game.round='showdown';finishPoker(game);} else game.message=`${game.players[game.current]}の交換待ちです。`; return;
    }
  } else {
    const id=actorId, owed=Math.max(0,game.toCall-game.contrib[id]);
    if(action.kind==='fold')game.folded.push(id);
    else if(action.kind==='check'&&owed===0){}
    else if(action.kind==='call'||action.kind==='check'){
      if(owed>game.chips[id])throw new Error('コインが足りません。');game.chips[id]-=owed;game.contrib[id]+=owed;game.pot+=owed;
    } else if(action.kind==='raise'){
      const raise=Math.max(20,Math.min(200,Math.floor(Number(action.amount)||20))), pay=owed+raise;
      if(pay>game.chips[id])throw new Error('レイズ額が所持チップを超えています。');game.chips[id]-=pay;game.contrib[id]+=pay;game.pot+=pay;game.toCall=game.contrib[id];game.pending=game.players.filter(p=>p!==id&&!game.folded.includes(p));
    } else throw new Error('操作を選んでください。');
    game.pending=game.pending.filter(p=>p!==id); if(game.players.filter(p=>!game.folded.includes(p)).length===1){finishPoker(game);return;}
    if(!game.pending.length){
      if(game.round==='river'){finishPoker(game);return;}
      game.round=({preflop:'flop',flop:'turn',turn:'river'})[game.round];
      if(game.round==='flop')game.community.push(game.deck.pop(),game.deck.pop(),game.deck.pop());else game.community.push(game.deck.pop());
      game.contrib=Object.fromEntries(game.players.map(p=>[p,0]));game.toCall=0;game.pending=game.players.filter(p=>!game.folded.includes(p));
    }
    game.current=nextActive(game,game.current);game.message=`${game.round} · ${game.players[game.current]}の番です。`;return;
  }
  throw new Error('ポーカーの状態が不正です。');
}
function playReversi(game, actorId, x, y) {
  if(game.status!=='playing'||game.players[game.current]!==actorId) throw new Error('リバーシの順番ではありません。');
  const move=reversiLegal(game.board,game.colors[actorId]).find(m=>m.x===x&&m.y===y);
  if(!move) throw new Error('そこには置けません。置ける場所を選んでください。');
  game.board[y][x]=game.colors[actorId]; for(const [fx,fy] of move.flips)game.board[fy][fx]=game.colors[actorId];
  game.current=1-game.current;
  if(!reversiLegal(game.board,game.colors[game.players[game.current]]).length) {
    game.current=1-game.current;
    if(!reversiLegal(game.board,game.colors[game.players[game.current]]).length) {
      game.status='finished'; const scores=game.players.map(id=>game.board.flat().filter(c=>c===game.colors[id]).length);
      game.winnerId=scores[0]===scores[1]?null:game.players[scores[0]>scores[1]?0:1]; game.scores=Object.fromEntries(game.players.map((id,i)=>[id,scores[i]]));
    }
  }
  game.message=game.status==='finished'?'対局終了':`${game.players[game.current]}の番です。`;
}

export function legalReversiMoves(game, playerId) { return reversiLegal(game.board,game.colors[playerId]); }
export function comparePokerHands(first, second) { return compareScore(bestHand(first),bestHand(second)); }
export function publicPokerState(state, viewerId) {
  const result=copy(state);
  if(['holdem','draw-poker'].includes(result.game?.mode)) {
    result.game.deckCount=result.game.deck.length;result.game.deck=[];
    if(result.game.status==='playing')result.game.hands=Object.fromEntries(Object.entries(result.game.hands).map(([id,hand])=>[id,id===viewerId?hand:hand.map(card=>({id:card.id,hidden:true}))]));
  }
  return result;
}
export function extendedApply(state, action) {
  if(action.type==='add-bet'&&state.game?.mode==='draw-poker'&&state.game.status==='playing')throw new Error('ドローポーカーには賭け金を使いません。');
  if(action.type==='start-game'&&['holdem','draw-poker'].includes(action.mode)){
    const next=copy(state);if(action.actorId!==next.hostId)throw new Error('この操作はホストのみ実行できます。');
    if(next.game?.status==='playing'||next.gamePot.locked)throw new Error('現在のゲームを終了し、賭け金を精算してください。');
    if(next.mahjongGame&&next.mahjongGame.status!=='finished')throw new Error('先に麻雀の局を終了してください。');
    next.game=newPokerGame(next,action.mode);const ids=next.game.players;next.players.forEach(p=>p.spectator=!ids.includes(p.id));next.revision=state.revision+1;return next;
  }
  if(action.type==='poker-action'){
    const next=copy(state);if(next.game?.mode!=='holdem'&&next.game?.mode!=='draw-poker')throw new Error('ポーカーは進行していません。');
    if(next.players.find(p=>p.id===action.actorId)?.spectator)throw new Error('観戦中は操作できません。');
    pokerAction(next.game,action.action,action.actorId);if(next.game.status==='finished'){next.players.forEach(p=>p.spectator=false);next.gamePot.locked=next.gamePot.amount>0;}
    next.revision=state.revision+1;return next;
  }
  if(action.type==='settle-pot'&&['reversi','holdem','draw-poker'].includes(state.game?.mode)) {
    const next=copy(state); if(action.actorId!==next.hostId)throw new Error('この操作はホストのみ実行できます。');
    if(next.game.status!=='finished'||next.gamePot.amount<1)throw new Error('精算できる賭け金がありません.');
    if(action.refund){for(const [id,amount] of Object.entries(next.gamePot.contributions)){const p=next.players.find(v=>v.id===id);if(p)p.coins+=amount;}}
    else {const ids=action.winnerIds||[action.winnerId];if(!ids.length||ids.some(id=>!next.game.players.includes(id)))throw new Error('勝者を選択してください。');if(next.game.winnerId&&!ids.includes(next.game.winnerId))throw new Error('ゲーム結果の勝者に賭け金を渡してください。');const share=Math.floor(next.gamePot.amount/ids.length);ids.forEach(id=>{const p=next.players.find(v=>v.id===id);if(p)p.coins+=share;});}
    next.gamePot={amount:0,contributions:{},locked:false};next.revision=state.revision+1;return next;
  }
  if(action.type==='start-game'&&action.mode==='reversi') {
    const next=copy(state); if(action.actorId!==next.hostId) throw new Error('この操作はホストのみ実行できます。');
    if(next.mahjongGame&&next.mahjongGame.status!=='finished') throw new Error('先に麻雀の局を終了してください。');
    if(next.game?.status==='playing'||next.gamePot.locked) throw new Error('現在のゲームを終了し、賭け金を精算してください。');
    const players=next.players.filter(p=>!p.spectator); if(players.length<2) throw new Error('リバーシには2人必要です。');
    const ids=players.slice(0,2).map(p=>p.id); next.players.forEach(p=>p.spectator=!ids.includes(p.id));
    const board=Array.from({length:8},()=>Array(8).fill(null)); board[3][3]='white';board[4][4]='white';board[3][4]='black';board[4][3]='black';
    next.game={mode:'reversi',status:'playing',players:ids,current:0,colors:{[ids[0]]:'black',[ids[1]]:'white'},board,message:`${ids[0]}の番です。`};
    next.revision=state.revision+1; return next;
  }
  if(action.type==='reversi-move') {
    const next=copy(state); if(next.players.find(p=>p.id===action.actorId)?.spectator)throw new Error('観戦中は操作できません。');
    if(next.game?.mode!=='reversi') throw new Error('リバーシは進行していません。'); playReversi(next.game,action.actorId,action.x,action.y);
    if(next.game.status==='finished'){next.players.forEach(p=>p.spectator=false);next.gamePot.locked=next.gamePot.amount>0;} next.revision=state.revision+1;return next;
  }
  if(action.type==='mahjong-win') {
    const next=copy(state), game=next.mahjongGame; if(!game||game.status==='finished')throw new Error('麻雀の局が進行していません。');
    const id=action.actorId, hand=next.mahjongTiles.filter(t=>t.zone==='hand'&&t.ownerId===id), melds=next.mahjongTiles.filter(t=>t.zone==='meld'&&t.ownerId===id);
    if(!next.players.some(p=>p.id===id)) throw new Error('参加者が見つかりません。');
    const isTsumo=action.kind==='tsumo'; let tiles=hand;
    if(isTsumo){if(game.currentPlayerId!==id||game.phase!=='discard')throw new Error('ツモできる手番ではありません。');}
    else {const discard=next.mahjongTiles.find(t=>t.id===game.lastDiscardId&&t.zone==='river');if(!discard||discard.ownerId===id||game.phase!=='draw')throw new Error('ロンできる捨て牌がありません。'); tiles=[...hand,discard];}
    if(!standardWin(tiles,melds.length/3))throw new Error('和了形ではありません。');
    if(!hasYaku(tiles,melds.length/3,action.kind,game,id,next))throw new Error('役がないため和了できません。');
    if(!isTsumo) {
      const waits=[];
      for(const suit of ['man','pin','sou','ji']) for(let rank=1;rank<=(suit==='ji'?7:9);rank++) {
        const candidate={suit,rank}; if(standardWin([...hand,candidate],melds.length/3)) waits.push(tileKey(candidate));
      }
      const ownDiscards=game.mahjongPlayers?.[id]?.discardedKeys||[];
      if(waits.some(key=>ownDiscards.includes(key)))throw new Error('フリテンのためロンできません。');
    }
    game.status='finished';game.winnerId=id;game.winKind=action.kind;game.message=`${next.players.find(p=>p.id===id)?.name||'プレイヤー'}が${isTsumo?'ツモ':'ロン'}しました。`;game.phase='finished';
    next.players.forEach(p=>p.spectator=false); next.gamePot.locked=next.gamePot.amount>0; next.revision=state.revision+1; return next;
  }
  return null;
}
