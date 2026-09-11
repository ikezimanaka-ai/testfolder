(() => {
  'use strict';
  const SUITS = ['s', 'h', 'd', 'c'];
  const SUIT_NAMES = {s:'スペード', h:'ハート', d:'ダイヤ', c:'クラブ'};
  const RANK_NAMES = {1:'A', 11:'J', 12:'Q', 13:'K'};
  const HAND_NAMES = ['ハイカード','ワンペア','ツーペア','スリーカード','ストレート','フラッシュ','フルハウス','フォーカード','ストレートフラッシュ','ファイブカード'];
  const defaultSettings = { cpuCount:3, startingCoins:500, ante:10, betUnit:10, turns:1, maxDraw:5, joker:false, limit:true };
  const state = { settings:{...defaultSettings}, players:[], bankrolls:{}, deck:[], discard:[], pot:0, phase:'idle', round:0, turn:0, selected:new Set(), currentBet:0, winner:null, busy:false };
  const $ = id => document.getElementById(id);
  const imagePath = card => card.joker ? '../cards/j01@2x.png' : `../cards/${card.suit}${String(card.rank).padStart(2,'0')}@2x.png`;
  const preloadPaths = ['../cards/back@2x.png', '../cards/j01@2x.png', '../cards/j02@2x.png'];
  SUITS.forEach(suit => { for (let rank=1; rank<=13; rank++) preloadPaths.push(`../cards/${suit}${String(rank).padStart(2,'0')}@2x.png`); });

  function prepareOffline() {
    const status = $('loadingStatus');
    const progress = $('loadingProgress');
    const total = preloadPaths.length;
    let loaded = 0;
    const updateProgress = () => {
      loaded++;
      progress.style.width = `${Math.round(loaded / total * 100)}%`;
      status.textContent = `カード画像を保存中... ${loaded} / ${total}`;
    };
    const images = preloadPaths.map(path => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => { updateProgress(); resolve(); };
      image.onerror = () => reject(new Error(`カード画像を読み込めません: ${path}`));
      image.src = path;
    }));
    return Promise.all(images).then(() => {
      status.textContent = 'OFFLINE READY · Wifiを切ってプレイできます';
      return new Promise(resolve => setTimeout(resolve, 350));
    }).then(() => $('offlineLoading').classList.add('ready'));
  }

  function makeDeck() { const deck = []; SUITS.forEach(suit => { for (let rank=1; rank<=13; rank++) deck.push({suit, rank, id:`${suit}${rank}`}); }); if (state.settings.joker) deck.push({joker:true,id:'joker'}); return deck; }
  function shuffle(deck) { for (let i=deck.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; } return deck; }
  function drawCard() {
    if (!state.deck.length && state.discard.length) state.deck=shuffle(state.discard.splice(0));
    return state.deck.pop() || makeDeck()[Math.floor(Math.random()*52)];
  }
  function sortRanks(cards) { return cards.filter(c=>!c.joker).map(c=>c.rank).sort((a,b)=>b-a); }
  function evaluateHand(cards) {
    const jokers = cards.filter(c=>c.joker).length, natural = cards.filter(c=>!c.joker), ranks = sortRanks(cards), counts = {};
    natural.forEach(c => counts[c.rank]=(counts[c.rank]||0)+1);
    const groups = Object.values(counts).sort((a,b)=>b-a);
    const suits = new Set(natural.map(c=>c.suit));
    let straightHigh = 0;
    for (let high=14; high>=5; high--) { const needed=[high,high-1,high-2,high-3,high-4]; if (needed.filter(n=>ranks.includes(n)).length + jokers >= 5) { straightHigh=high; break; } }
    if (!straightHigh && ranks.includes(14) && ranks.includes(2) && ranks.includes(3) && ranks.includes(4) && (jokers >= 1 || ranks.includes(5))) straightHigh=5;
    const flush = natural.length === 5 && suits.size === 1 || natural.length + jokers === 5 && suits.size <= 1;
    if (jokers && groups[0] === 4) return {rank:9,name:HAND_NAMES[9],tiebreak:[14],wild:true};
    if (straightHigh && flush) return {rank:8,name:HAND_NAMES[8],tiebreak:[straightHigh],wild:jokers>0};
    if (groups[0] + jokers >= 4) return {rank:7,name:HAND_NAMES[7],tiebreak:[groups[0] === 4 ? (Object.keys(counts).find(k=>counts[k]===4) * 1) : 14],wild:jokers>0};
    if (groups[0] + jokers >= 3 && (groups[1] || 0) + Math.max(0,jokers-(3-groups[0])) >= 2) return {rank:6,name:HAND_NAMES[6],tiebreak:ranks,wild:jokers>0};
    if (flush) return {rank:5,name:HAND_NAMES[5],tiebreak:ranks,wild:jokers>0};
    if (straightHigh) return {rank:4,name:HAND_NAMES[4],tiebreak:[straightHigh],wild:jokers>0};
    if (groups[0] + jokers >= 3) return {rank:3,name:HAND_NAMES[3],tiebreak:ranks,wild:jokers>0};
    if (groups[0] + jokers >= 2 && (groups[1] || 0) >= 2) return {rank:2,name:HAND_NAMES[2],tiebreak:ranks,wild:jokers>0};
    if (groups[0] + jokers >= 2) return {rank:1,name:HAND_NAMES[1],tiebreak:ranks,wild:jokers>0};
    return {rank:0,name:HAND_NAMES[0],tiebreak:ranks,wild:false};
  }
  function compareHands(a,b) { if (a.rank !== b.rank) return a.rank-b.rank; for(let i=0;i<Math.max(a.tiebreak.length,b.tiebreak.length);i++) if((a.tiebreak[i]||0)!==(b.tiebreak[i]||0)) return (a.tiebreak[i]||0)-(b.tiebreak[i]||0); return 0; }
  function saveBankrolls() { state.players.forEach(player => { state.bankrolls[player.id]=player.coins; }); }
  function takeAnte() {
    state.pot=0;
    state.players.forEach(player => {
      player.roundBet=0;
      player.folded=false;
      player.spectating=false;
      player.inactive=player.coins < state.settings.ante;
      player.folded=player.inactive;
      if (player.inactive) return;
      player.coins-=state.settings.ante;
      state.pot+=state.settings.ante;
    });
  }
  function resolveParticipation() {
    const you=state.players[0];
    const active=state.players.filter(player=>!player.inactive);
    if (you.inactive) {
      state.phase='finished';
      $('centerMessage').innerHTML='<span class="center-kicker">OUT OF COINS</span><strong>YOU LOSE</strong>';
      showToast('アンティを払えないため敗北しました');
      return true;
    }
    if (active.length===1) {
      state.winner=you.id;
      you.coins+=state.pot;
      state.pot=0;
      state.phase='finished';
      $('centerMessage').innerHTML='<span class="center-kicker">LAST PLAYER STANDING</span><strong>YOU WIN</strong>';
      showToast('あなた以外が参加できないため勝利しました');
      return true;
    }
    return false;
  }
  function newGame() {
    saveBankrolls();
    state.round++; state.turn=0; state.phase='deal'; state.winner=null; state.selected.clear(); state.currentBet=0; state.discard=[]; state.deck=shuffle(makeDeck());
    const createPlayer=(id,name,label)=>({id,name,label,coins:Number(state.bankrolls[id] ?? state.settings.startingCoins),hand:[],folded:false,spectating:false,inactive:false,roundBet:0});
    state.players=[createPlayer('you','YOU','あなた'),createPlayer('cpu1','CPU 01','CPU')];
    for(let i=2;i<=state.settings.cpuCount;i++) state.players.push(createPlayer(`cpu${i}`,`CPU ${String(i).padStart(2,'0')}`,'CPU'));
    state.players.forEach(player => { for(let i=0;i<5;i++) player.hand.push(drawCard()); });
    takeAnte(); renderPlayers(true); renderHand(true); updateTable();
    if (resolveParticipation()) { renderPlayers(); updateTable(); return; }
    setTimeout(()=>{state.phase='bet'; updateText();},500);
  }
  function renderPlayers(animate=false) {
    $('playerCount').textContent=String(state.players.length).padStart(2,'0');
    $('playerList').innerHTML=state.players.map((p,i)=>{
      const showCards=state.phase==='finished' || state.phase==='showdown';
      const evaluation=showCards && p.hand.length?evaluateHand(p.hand):null;
      const miniHand=i===0?'':`<div class="opponent-hand">${p.hand.map(card=>`<img class="mini-card ${showCards?'revealed-card':'hidden-card'} ${animate?'cpu-deal-in':''}" src="${showCards?imagePath(card):'../cards/back@2x.png'}" alt="${showCards?(card.joker?'ジョーカー':'CPUのカード'):'相手の伏せカード'}">`).join('')}</div><div class="opponent-evaluation">${evaluation?evaluation.name:'非公開'}${evaluation?.wild?' · WILD':''}</div>`;
      return `<div class="player ${i===0?'active':''} ${p.folded||p.inactive?'folded':''}"><div class="player-main"><div class="avatar ${i===0?'you':''}">${i===0?'YOU':'C'+i}</div><div><div class="player-name">${p.label}</div><div class="player-state">${p.inactive?'OUT OF COINS':p.spectating?'SPECTATING':p.folded?'FOLDED':i===0?'YOUR SEAT':'CPU PLAYER'}</div></div><div class="player-coins">◉ ${p.coins}</div></div>${miniHand}</div>`;
    }).join('');
  }
  function renderHand(animate=false) { const hand=state.players[0]?.hand||[]; $('playerHand').innerHTML=hand.map((card,i)=>`<div class="playing-card ${state.selected.has(i)?'selected':''} ${animate?'deal-in':''}" data-index="${i}" style="animation-delay:${i*70}ms"><img src="${imagePath(card)}" alt="${card.joker?'ジョーカー':SUIT_NAMES[card.suit]+(RANK_NAMES[card.rank]||card.rank)}"></div>`).join(''); $('selectionCount').textContent=`${state.selected.size} / 5 selected`; $('exchangeButton').disabled=state.phase!=='draw' || state.busy; const handValue=hand.length?evaluateHand(hand):null; $('handEvaluation').textContent=handValue?`${handValue.name}${handValue.wild?' · JOKER WILD':''}`:'カードが配られると役が表示されます'; }
  function renderDiscard(card) { const el=document.createElement('img'); el.src=imagePath(card); el.alt='捨て札'; el.className='deal-in'; $('discardStack').prepend(el); while($('discardStack').children.length>3) $('discardStack').lastChild.remove(); }
  function addChips(amount) { const chips=$('potChips'); chips.innerHTML=''; for(let i=0;i<Math.min(8,Math.ceil(amount/25));i++){const chip=document.createElement('i');chip.style.setProperty('--i',i);chip.className='chip-in';chip.style.animationDelay=`${i*50}ms`;chips.appendChild(chip);} }
  function updateTable() { $('potValue').textContent=state.pot; $('anteValue').textContent=state.settings.ante; $('deckCount').textContent=state.deck.length; addChips(state.pot); updateText(); }
  function updateText() { const labels={idle:'卓を準備中',deal:'カードを配布中',bet:'チェックまたは降りる',draw:'カードを交換',showdown:'ショーダウン',finished:'ラウンド終了'}; $('phaseLabel').textContent=labels[state.phase]||labels.idle; $('roundLabel').textContent=`ROUND ${String(state.round||1).padStart(2,'0')}`; const hints={idle:'参加人数を選んでゲーム開始',bet:`ターン ${state.turn+1} / ${state.settings.turns} · チェックまたは降りる`,draw:`ターン ${state.turn+1} / ${state.settings.turns} · カードを選択`,showdown:'全員のカードを公開中',finished:'勝者がポットを獲得しました'}; $('actionHint').textContent=hints[state.phase]||''; $('tableMessage').textContent=state.phase==='draw'?'交換するカードを選択':state.phase==='finished'?'次のラウンドへ':(labels[state.phase]||'カードを選んで交換'); $('mainAction').textContent=state.phase==='idle'?'ゲーム開始':state.phase==='draw'?'交換する':state.phase==='finished'?'新しいゲーム':'チェック'; $('foldButton').disabled=state.phase!=='bet'; }
  function cpuBet() { state.players.slice(1).forEach(player=>{if(player.folded||player.inactive)return; const hand=evaluateHand(player.hand); if(hand.rank===0 && Math.random()<.4 || hand.rank===1 && Math.random()<.12){ player.folded=true; return; } const aggression=hand.rank>=2?2:1; const amount=Math.min(player.coins,state.settings.betUnit*aggression); player.coins-=amount; player.roundBet+=amount; state.pot+=amount;}); }
  function playerBet() { const amount=Math.min(state.players[0].coins,state.settings.betUnit); if(state.settings.limit && state.currentBet+amount>state.settings.ante*10) return showToast('ベット上限に達しています'); state.players[0].coins-=amount; state.players[0].roundBet+=amount; state.currentBet+=amount; state.pot+=amount; cpuBet(); renderPlayers(); updateTable(); }
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function cpuDraw() { for (const player of state.players.slice(1)) { if(player.folded||player.inactive||player.spectating)continue; await wait(800); const hand=evaluateHand(player.hand), keep=[]; player.hand.forEach((card,i)=>{if(card.joker||hand.rank>=4||(hand.rank===1&&Math.random()>.35))keep.push(i);}); const replace=player.hand.map((_,i)=>i).filter(i=>!keep.includes(i)).slice(0,state.settings.maxDraw); replace.forEach(i=>{state.discard.push(player.hand[i]); player.hand[i]=drawCard();}); renderPlayers(true); } }
  async function doDraw() { if(state.busy)return; const indexes=[...state.selected].slice(0,state.settings.maxDraw); state.busy=true; $('exchangeButton').disabled=true; indexes.forEach(i=>{state.discard.push(state.players[0].hand[i]); renderDiscard(state.players[0].hand[i]);}); const replacements=indexes.map(()=>drawCard()); indexes.forEach((i,n)=>state.players[0].hand[i]=replacements[n]); state.selected.clear(); renderHand(true); updateTable(); showToast(indexes.length ? `${indexes.length}枚を交換しました` : 'カードを交換せず次のターンへ進みます'); await cpuDraw(); state.turn++; state.busy=false; if(state.turn>=state.settings.turns){ showdown(); return; } state.phase='bet'; renderPlayers(true); updateTable(); }
  function showdown() { state.phase='showdown'; const alive=state.players.filter(p=>!p.folded&&!p.inactive&&!p.spectating); alive.forEach(p=>p.evaluation=evaluateHand(p.hand)); alive.sort((a,b)=>compareHands(b.evaluation,a.evaluation)); const winner=alive[0]; if(!winner)return; state.winner=winner.id; winner.coins+=state.pot; state.pot=0; state.phase='finished'; renderHand(); renderPlayers(); updateTable(); $('centerMessage').innerHTML=`<span class="center-kicker">WINNER · ${winner.name}</span><strong>${winner.evaluation.name}</strong>`; showToast(`${winner.label} が勝利。${winner.evaluation.name}でポット獲得`); }
  function action() { if(state.busy)return; if(state.phase==='idle'||state.phase==='finished') return newGame(); if(state.phase==='bet'){playerBet(); state.phase='draw'; renderHand(); renderPlayers(); updateTable(); return;} if(state.phase==='draw')return doDraw(); }
  async function fold() { if(state.phase!=='bet'||state.busy)return; state.busy=true; const player=state.players[0]; player.folded=true; player.spectating=true; state.discard.push(...player.hand.splice(0)); state.selected.clear(); state.turn++; state.busy=false; const alive=state.players.filter(p=>!p.folded&&!p.inactive&&!p.spectating); if(!alive.length){state.pot=0;state.phase='finished';$('centerMessage').innerHTML='<span class="center-kicker">YOU FOLDED</span><strong>YOU LOSE</strong>';showToast('降りたため敗北しました');} else if(alive.length===1){state.winner=alive[0].id;alive[0].coins+=state.pot;state.pot=0;state.phase='finished';$('centerMessage').innerHTML=`<span class="center-kicker">WINNER · ${alive[0].name}</span><strong>YOU LOSE</strong>`;showToast('降りたため敗北しました');} else if(state.turn>=state.settings.turns){showdown();return;} else {state.phase='bet';} renderHand(); renderPlayers();updateTable(); }
  function showToast(text){const toast=$('toast');toast.textContent=text;toast.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove('show'),2200);}
  function applySettings(){ const nextSettings={cpuCount:+$('cpuCount').value,startingCoins:+$('startingCoins').value,ante:+$('anteSetting').value,betUnit:+$('betUnit').value,turns:+$('turns').value,maxDraw:+$('maxDraw').value,joker:$('jokerToggle').checked,limit:$('limitToggle').checked}; const changed=JSON.stringify(nextSettings)!==JSON.stringify(state.settings); if(changed){state.bankrolls={};state.players=[];} state.settings=nextSettings; $('settingsDialog').close(); showToast(changed?'設定を変更しました。次のゲームでコインをリセットします':'設定を保存しました。コインを維持します'); updateTable(); }
  $('mainAction').addEventListener('click',action); $('foldButton').addEventListener('click',fold); $('exchangeButton').addEventListener('click',doDraw); $('clearSelection').addEventListener('click',()=>{state.selected.clear();renderHand();}); $('settingsButton').addEventListener('click',()=> $('settingsDialog').showModal()); $('rulesButton').addEventListener('click',()=> $('rulesDialog').showModal()); $('applySettings').addEventListener('click',applySettings); $('playerHand').addEventListener('click',e=>{const card=e.target.closest('.playing-card');if(!card||state.phase!=='draw')return;const i=+card.dataset.index;state.selected.has(i)?state.selected.delete(i):state.selected.add(i);renderHand();});
  window.PokerEngine={state,createGame:newGame,evaluateHand,compareHands,drawCard,replaceCards:(playerId,indexes)=>{const player=state.players.find(p=>p.id===playerId);if(!player)return;indexes.forEach(i=>{state.discard.push(player.hand[i]);player.hand[i]=drawCard();});return player.hand;},getPublicState:()=>({phase:state.phase,players:state.players.map(p=>({id:p.id,name:p.name,coins:p.coins,hand:p.hand.map(c=>({...c,joker:c.joker||false}))})),pot:state.pot,deckCount:state.deck.length,settings:{...state.settings}})};
  prepareOffline().then(() => updateTable()).catch(error => {
    $('loadingStatus').textContent = 'カード画像を読み込めません。通信状態を確認してください。';
    console.error(error);
  });
})();
