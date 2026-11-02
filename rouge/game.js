import { SceneEngine, INPUT } from "../editor/engine/scene-engine/engine.js";

const W=1000,H=625,canvas=document.querySelector("#game"),ctx=canvas.getContext("2d");
const engine=new SceneEngine({canvas,width:W,height:H,fps:60,background:"#101321"});
const semesterNames=["前期","中期","後期"];
const foes=[
  {name:"一次関数の亡霊",symbol:"y=ax+b",sub:"数学 · 小テストの残像",hp:34,damage:7,color:"#8d8cff"},
  {name:"電気記号のテスト",symbol:"Ω",sub:"理科 · 抵抗の追試",hp:40,damage:8,color:"#58d8cc"},
  {name:"古文単語帳の番人",symbol:"ゐ",sub:"国語 · 暗記の化身",hp:46,damage:8,color:"#ff9b78"},
  {name:"英単語の黒板",symbol:"ABC",sub:"英語 · 書き取り地獄",hp:52,damage:9,color:"#f2c565"},
  {name:"二次方程式の怪物",symbol:"x²",sub:"数学 · 解の公式",hp:58,damage:10,color:"#a795ef"},
  {name:"化学式の実験体",symbol:"H₂O",sub:"理科 · 化学反応式",hp:64,damage:10,color:"#6cc7dd"},
  {name:"世界史年号の巨人",symbol:"1192",sub:"歴史 · 年号暗記",hp:70,damage:11,color:"#e2ad68"},
  {name:"長文読解の迷宮",symbol:"ABC…",sub:"英語 · 時間との勝負",hp:76,damage:12,color:"#74c9a8"},
  {name:"期末試験の魔王",symbol:"期末",sub:"全教科 · 最終問題",hp:84,damage:13,color:"#ed668e"},
];
const examFoe={name:"大学入試",symbol:"合格",sub:"受験 · これまでの全教科",hp:140,damage:16,color:"#ffd36f"};
const cards={
 strike:{name:"ノートで叩く",symbol:"✎",cost:1,desc:"敵に 8 ダメージ",kind:"攻撃",color:"#ff8a9e"},
 heavy:{name:"全力で解く",symbol:"∑",cost:2,desc:"敵に 16 ダメージ",kind:"攻撃",color:"#ff8a9e"},
 guard:{name:"公式を盾に",symbol:"▱",cost:1,desc:"防御 8 を得る",kind:"防御",color:"#7cd9c5"},
 dodge:{name:"机の下へ！",symbol:"↝",cost:0,desc:"次の攻撃を必ず回避",kind:"即時",color:"#8eb4ff"},
 draw:{name:"教科書をめくる",symbol:"▤",cost:0,desc:"カードを 2 枚引く",kind:"即時",color:"#8eb4ff"},
 focus:{name:"深呼吸",symbol:"◌",cost:1,desc:"MP を 2 回復",kind:"精神",color:"#c39cff"},
 spell:{name:"公式をぶつける",symbol:"⚡",cost:2,mp:2,desc:"MP 2 · 20 ダメージ",kind:"必殺",color:"#ffd36f"},
 drain:{name:"ひらめき！",symbol:"✦",cost:2,mp:2,desc:"MP 2 · 12ダメージとHP+8",kind:"必殺",color:"#ffd36f"},
 quick:{name:"早押し回答",symbol:"↯",cost:0,desc:"敵に 5 ダメージ",kind:"即時",color:"#8eb4ff"},
 barrier:{name:"机を並べる",symbol:"▰",cost:1,mp:2,desc:"MP 2 · 防御 20 を得る",kind:"防御術",color:"#7cd9c5"},
 recover:{name:"保健室へ行く",symbol:"✚",cost:1,desc:"HP を 12 回復",kind:"回復",color:"#ff8a9e"},
 cram:{name:"一夜漬けの集中",symbol:"☾",cost:2,mp:2,desc:"MP 2 · この戦闘中の攻撃 +10",kind:"強化術",color:"#c39cff"},
 blast:{name:"落雷の公式",symbol:"ϟ",cost:3,mp:3,desc:"MP 3 · 32 ダメージ",kind:"必殺",color:"#ffd36f"},
 quiz:{name:"逆質問",symbol:"?!",cost:2,desc:"敵に 5 ダメージを3回",kind:"連撃",color:"#ff9d78"},
 delay:{name:"時間稼ぎ",symbol:"⌛",cost:1,desc:"敵の次の攻撃を2秒遅らせる",kind:"妨害",color:"#8eb4ff"},
 insight:{name:"ひらめきメモ",symbol:"☷",cost:0,desc:"カードを1枚引く",kind:"即時",color:"#8eb4ff"},
 gamble:{name:"山勘で解答",symbol:"🎲",cost:0,desc:"敵に 0〜20 ダメージ",kind:"即時",color:"#ff9d78"},
 meditate:{name:"放課後の自習",symbol:"✧",cost:1,desc:"HP を 8 回復",kind:"回復",color:"#ff8a9e"},
 arc:{name:"電磁誘導",symbol:"∿",cost:2,mp:2,desc:"MP 2 · 24 ダメージ",kind:"攻撃術",color:"#ffd36f"},
 beam:{name:"極大公式",symbol:"Σ",cost:3,mp:4,desc:"MP 4 · 42 ダメージ",kind:"必殺",color:"#ffd36f"},
 burst:{name:"連立魔法陣",symbol:"⊗",cost:2,mp:3,desc:"MP 3 · 10ダメージを3回",kind:"連撃術",color:"#ffd36f"},
 vamp:{name:"生命線の証明",symbol:"∮",cost:2,mp:3,desc:"MP 3 · 16ダメージ、HP+10",kind:"吸収術",color:"#ff9dba"},
 boost:{name:"必勝の暗記",symbol:"↑",cost:1,mp:2,desc:"MP 2 · この戦闘中の攻撃 +8",kind:"強化術",color:"#c39cff"},
 scholar:{name:"天才モード",symbol:"✧",cost:2,mp:3,desc:"MP 3 · この戦闘中の攻撃 +16",kind:"強化術",color:"#c39cff"},
 weaken:{name:"弱点を見抜く",symbol:"⌁",cost:1,mp:2,desc:"MP 2 · 敵の次の攻撃を10軽減",kind:"妨害術",color:"#8eb4ff"},
 ward:{name:"結界方程式",symbol:"◇",cost:1,mp:2,desc:"MP 2 · 防御 24 を得る",kind:"防御術",color:"#7cd9c5"},
 firstaid:{name:"特効薬",symbol:"✚",cost:2,mp:1,desc:"MP 1 · HP を 22 回復",kind:"回復",color:"#ff8a9e"},
 snack:{name:"購買のパン",symbol:"🥐",cost:0,desc:"HP を 7 回復",kind:"回復",color:"#ff8a9e"},
 overcharge:{name:"全力詠唱",symbol:"⚡",cost:2,mp:2,desc:"MP 2 · 18ダメージ、戦闘中の攻撃 +4",kind:"攻撃術",color:"#ffd36f"},
};
const perks=[
 {icon:"♥",name:"保健室で休憩",desc:"最大HP +12、HPを全回復",apply:g=>{g.maxHp+=12;g.hp=g.maxHp}},
 {icon:"✧",name:"冷たいジュース",desc:"最大MP +3、MPを全回復",apply:g=>{g.maxMp+=3;g.mp=g.maxMp}},
 {icon:"↝",name:"上履きダッシュ",desc:"回避率 +10%",apply:g=>g.dodge=Math.min(70,g.dodge+10)},
 {icon:"∑",name:"赤ペン先生",desc:"攻撃ダメージ +3",apply:g=>g.bonus+=3},
 {icon:"⚡",name:"秘密の公式",desc:"「公式をぶつける」をデッキに追加",apply:g=>g.deck.push("spell")},
 {icon:"▱",name:"分厚い参考書",desc:"防御力 +2",apply:g=>g.armor+=2},
 {icon:"☕",name:"放課後の補習",desc:"HPを18、MPを2回復",apply:g=>{g.hp=Math.min(g.maxHp,g.hp+18);g.mp=Math.min(g.maxMp,g.mp+2)}},
 {icon:"✦",name:"天才的ひらめき",desc:"「ひらめき！」をデッキに追加",apply:g=>g.deck.push("drain")},
 {icon:"↯",name:"早押し特訓",desc:"「早押し回答」をデッキに追加",apply:g=>g.deck.push("quick")},
 {icon:"✚",name:"保健委員に任命",desc:"「保健室へ行く」をデッキに追加",apply:g=>g.deck.push("recover")},
 {icon:"ϟ",name:"理科室の実験",desc:"「落雷の公式」をデッキに追加",apply:g=>g.deck.push("blast")},
 {icon:"?!",name:"抜き打ち対策",desc:"「逆質問」をデッキに追加",apply:g=>g.deck.push("quiz")},
 {icon:"⌛",name:"先生の話をそらす",desc:"「時間稼ぎ」をデッキに追加",apply:g=>g.deck.push("delay")},
 {icon:"☷",name:"付箋だらけのノート",desc:"「ひらめきメモ」をデッキに追加",apply:g=>g.deck.push("insight")},
 {icon:"☾",name:"徹夜の覚悟",desc:"「一夜漬けの集中」をデッキに追加",apply:g=>g.deck.push("cram")},
 {icon:"▰",name:"机の補強",desc:"「机を並べる」をデッキに追加",apply:g=>g.deck.push("barrier")},
 {icon:"☷",name:"自習室の鍵",desc:"「放課後の自習」をデッキに追加",apply:g=>g.deck.push("meditate")},
 {icon:"🎲",name:"勘を磨く",desc:"「山勘で解答」をデッキに追加",apply:g=>g.deck.push("gamble")},
 {icon:"∿",name:"磁石とコイル",desc:"「電磁誘導」をデッキに追加",apply:g=>g.deck.push("arc")},
 {icon:"Σ",name:"数学オリンピック",desc:"「極大公式」をデッキに追加",apply:g=>g.deck.push("beam")},
 {icon:"⊗",name:"魔法陣の練習",desc:"「連立魔法陣」をデッキに追加",apply:g=>g.deck.push("burst")},
 {icon:"∮",name:"生命線の研究",desc:"「生命線の証明」をデッキに追加",apply:g=>g.deck.push("vamp")},
 {icon:"↑",name:"暗記カード作り",desc:"「必勝の暗記」をデッキに追加",apply:g=>g.deck.push("boost")},
 {icon:"◇",name:"結界のノート",desc:"「結界方程式」をデッキに追加",apply:g=>g.deck.push("ward")},
 {icon:"✚",name:"救急箱当番",desc:"「特効薬」をデッキに追加",apply:g=>g.deck.push("firstaid")},
 {icon:"🥐",name:"購買部の常連",desc:"「購買のパン」をデッキに追加",apply:g=>g.deck.push("snack")},
 {icon:"✧",name:"難問への挑戦",desc:"「天才モード」をデッキに追加",apply:g=>g.deck.push("scholar")},
 {icon:"⚡",name:"詠唱の鍛錬",desc:"「全力詠唱」をデッキに追加",apply:g=>g.deck.push("overcharge")},
];
let run=0,g=null,pointer={x:0,y:0,clicked:false},handRects=[],choiceRects=[],eventRect=null,endRects=[],animTime=0,toast="";
canvas.addEventListener("pointerdown",e=>{const r=canvas.getBoundingClientRect();pointer.x=(e.clientX-r.left)*W/r.width;pointer.y=(e.clientY-r.top)*H/r.height;pointer.clicked=true;canvas.focus()});
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function currentFoe(){if(g.stage<9){const base=foes[g.stage],scale=1+Math.floor(g.stage/3)*.18+(g.stage%3)*.08;return {...base,hp:Math.round(base.hp*scale),damage:Math.round(base.damage*scale)}}if(g.stage===9)return examFoe;const year=g.stage-9,base=foes[(year-1)%foes.length],scale=1+year*.35;return {...base,name:`浪人${year}年目 · ${base.name}`,hp:Math.round(base.hp*scale),damage:Math.round(base.damage*scale)}}
function campaignLabel(){if(g.stage<9)return `${Math.floor(g.stage/3)+1}年 · ${semesterNames[g.stage%3]}`;if(g.stage===9)return "大学受験";return `浪人${g.stage-9}年目`}
function fresh(){run++;g={stage:0,kills:0,hp:48,maxHp:48,mp:10,maxMp:10,dodge:12,armor:0,bonus:0,battleBonus:0,enemyWeaken:0,deck:["strike","strike","strike","heavy","guard","guard","dodge","draw","focus","spell"],pile:[],discard:[],hand:[],shield:0,evade:false,enemyHp:34,enemyMax:34,enemyTimer:3.5,enemyAttackInterval:3.5,cooldown:0,seconds:0,log:"時間が経つと敵が自動で攻撃する。カードを使って応戦しよう。",ended:false};beginStage();engine.switchScene("combat")}
function beginStage(){const s=currentFoe();g.enemyHp=g.enemyMax=s.hp;g.enemyAttackInterval=Math.max(1.6,3.5-Math.max(0,g.stage-5)*.08);g.enemyTimer=g.enemyAttackInterval;g.cooldown=0;g.shield=0;g.evade=false;g.battleBonus=0;g.enemyWeaken=0;g.seconds=0;g.pile=shuffle([...g.deck]);g.discard=[];g.hand=[];draw(5);g.log=`${s.name}が立ちはだかった！ 時間経過で攻撃してくる。`}
function draw(n){for(let i=0;i<n;i++){if(!g.pile.length){if(!g.discard.length)break;g.pile=shuffle(g.discard.splice(0))}g.hand.push(g.pile.pop())}}
function hitEnemy(n){const actual=n+g.bonus+g.battleBonus;g.enemyHp=Math.max(0,g.enemyHp-actual);g.log=`${currentFoe().name}に ${actual} ダメージ！`;if(!g.enemyHp)clearStage()}
function play(i){if(!g||g.cooldown>0)return;const id=g.hand[i],c=cards[id];if(!c||(c.mp||0)>g.mp)return;g.hand.splice(i,1);g.discard.push(id);if(id==="strike")hitEnemy(8);else if(id==="heavy")hitEnemy(16);else if(id==="guard"){g.shield+=8;g.log="公式を盾にした。防御力 +8"}else if(id==="barrier"){g.mp-=2;g.shield+=20;g.log="MPを2使い、机を並べて防御力 +20"}else if(id==="ward"){g.mp-=2;g.shield+=24;g.log="結界方程式。MP 2、防御力 +24"}else if(id==="dodge"){g.evade=true;g.log="机の下へ！ 次の攻撃を必ず回避"}else if(id==="draw"){draw(2);g.log="教科書をめくった。カードを2枚引いた"}else if(id==="insight"){draw(1);g.log="メモを見返した。カードを1枚引いた"}else if(id==="focus"){g.mp=Math.min(g.maxMp,g.mp+2);g.log="深呼吸。MPを2回復"}else if(id==="cram"){g.mp-=2;g.battleBonus+=10;g.log="MPを2使い、一夜漬けで攻撃力 +10"}else if(id==="spell"){g.mp-=2;hitEnemy(20)}else if(id==="blast"){g.mp-=3;hitEnemy(32)}else if(id==="arc"){g.mp-=2;hitEnemy(24)}else if(id==="beam"){g.mp-=4;hitEnemy(42)}else if(id==="burst"){g.mp-=3;for(let n=0;n<3&&g.enemyHp>0;n++)hitEnemy(10);if(g.enemyHp>0)g.log="連立魔法陣！ 3連撃"}else if(id==="drain"){g.mp-=2;g.hp=Math.min(g.maxHp,g.hp+8);hitEnemy(12)}else if(id==="vamp"){g.mp-=3;g.hp=Math.min(g.maxHp,g.hp+10);hitEnemy(16)}else if(id==="overcharge"){g.mp-=2;hitEnemy(18);if(g.enemyHp>0)g.battleBonus+=4}else if(id==="boost"){g.mp-=2;g.battleBonus+=8;g.log="必勝の暗記。MP 2、攻撃力 +8"}else if(id==="scholar"){g.mp-=3;g.battleBonus+=16;g.log="天才モード！ MP 3、攻撃力 +16"}else if(id==="weaken"){g.mp-=2;g.enemyWeaken+=10;g.log="弱点を見抜いた。敵の次の攻撃を10軽減"}else if(id==="quick")hitEnemy(5);else if(id==="recover"){g.hp=Math.min(g.maxHp,g.hp+12);g.log="保健室で休んだ。HPを12回復"}else if(id==="firstaid"){g.mp-=1;g.hp=Math.min(g.maxHp,g.hp+22);g.log="特効薬。MP 1を使いHPを22回復"}else if(id==="snack"){g.hp=Math.min(g.maxHp,g.hp+7);g.log="購買のパンでHPを7回復"}else if(id==="quiz"){for(let n=0;n<3&&g.enemyHp>0;n++)hitEnemy(5);if(g.enemyHp>0)g.log="逆質問！ 3連続で攻めた"}else if(id==="delay"){g.enemyTimer+=2;g.log="先生の話をそらした。敵の攻撃を2秒遅らせた"}else if(id==="gamble")hitEnemy(Math.floor(Math.random()*21));else if(id==="meditate"){g.hp=Math.min(g.maxHp,g.hp+8);g.log="放課後の自習でHPを8回復"}if(!g||g.enemyHp<=0)return;g.cooldown=c.cost;if(!g.cooldown&&g.hand.length<5)draw(1)}
function enemyTurn(){if(g.evade){g.evade=false;g.log="攻撃をひらりと回避した！"}else{const raw=Math.max(0,currentFoe().damage+Math.floor(Math.random()*3)-1-g.enemyWeaken),blocked=Math.min(g.shield,raw),damage=Math.max(0,raw-blocked-g.armor);g.enemyWeaken=0;g.shield-=blocked;g.hp=Math.max(0,g.hp-damage);g.log=`敵の時間攻撃！ ${damage} ダメージ${blocked?`（防御 ${blocked}）`:""}`;if(g.hp<=0){engine.switchScene("over");return}}g.enemyTimer=g.enemyAttackInterval;if(g.hand.length<5)draw(1)}
function clearStage(){g.kills++;if(g.stage===9){engine.switchScene("victory");return}if(g.stage<9&&Math.random()<.16){triggerEvent();return}showUpgrade()}
function showUpgrade(){g.choices=shuffle([...perks]).slice(0,3);engine.switchScene("upgrade")}
function triggerEvent(){const pool=[{icon:"⚠",name:"唐突な確認テスト",text:"先生が予告なしの確認テストを配った！",result:"HPを8失ったが、必死の集中でMPを2得た。",apply(){g.hp=Math.max(1,g.hp-8);g.mp=Math.min(g.maxMp,g.mp+2)}},{icon:"☂",name:"台風で学校が休み",text:"暴風警報で休校！課題も授業も今日はなし。",result:"MP,HP +999！",apply(){g.mp=g.maxMp;g.hp=g.maxHp}},{icon:"🎪",name:"文化祭の差し入れ",text:"クラスメイトが差し入れを持ってきた。",result:"HPを10回復し、「早押し回答」をデッキに追加。",apply(){g.hp=Math.min(g.maxHp,g.hp+10);g.deck.push("quick")}},{icon:"📚",name:"図書室で自習",text:"静かな図書室で、苦手科目を復習した。",result:"HPを6、MPを4回復。",apply(){g.hp=Math.min(g.maxHp,g.hp+6);g.mp=Math.min(g.maxMp,g.mp+4)}}];g.event=pool[Math.floor(Math.random()*pool.length)];g.event.apply();engine.switchScene("event")}
function pickPerk(i){const p=g.choices[i];if(!p)return;p.apply(g);g.stage++;beginStage();engine.switchScene("combat")}
function rect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke()}}
function txt(s,x,y,size=16,color="#f0f2ff",weight=500,align="left",font="Manrope,'Noto Sans JP',sans-serif"){ctx.font=`${weight} ${size}px ${font}`;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline="middle";ctx.fillText(s,x,y)}
function bg(){let gr=ctx.createLinearGradient(0,0,0,H);gr.addColorStop(0,"#171a30");gr.addColorStop(1,"#101321");ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);ctx.fillStyle="#ffffff08";for(let y=0;y<H;y+=40){ctx.fillRect(0,y,W,1)}for(let x=0;x<W;x+=40){ctx.fillRect(x,0,1,H)}}
function panel(x,y,w,h){rect(x,y,w,h,12,"#151827dd","#353952")}
function topbar(label){txt("✦",35,32,22,"#a9adff");txt("STUDY SURVIVOR",62,28,11,"#959ab9",500,"left","'DM Mono',monospace");txt(label,62,51,15,"#f0f2ff",800);}
function drawTitle(){bg();topbar("放課後ダンジョン");ctx.save();ctx.globalAlpha=.2;for(let i=0;i<6;i++){ctx.strokeStyle=["#8b8fff","#5ce0d1","#ff7897"][i%3];ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(170+i*130,160);ctx.lineTo(340+i*78,490);ctx.stroke()}ctx.restore();panel(110,100,780,440);txt("STUDY SURVIVOR",500,167,12,"#9298c1",500,"center","'DM Mono',monospace");txt("放課後ダンジョン",500,226,38,"#f3f2ff",900,"center");txt("教科書の世界に迷い込んだ。カードを使って、試験の怪物を倒そう。",500,276,15,"#aeb2cc",500,"center");const foes=["y=ax+b","Ω","ゐ","ABC","期末"];foes.forEach((x,i)=>{rect(216+i*116,324,92,92,16,"#20243a",`#${["8d8cff","58d8cc","ff9b78","f2c565","ed668e"][i]}`);txt(x,262+i*116,370,20,`#${["a8a7ff","7ce5da","ffac8c","f5d486","ff8ba8"][i]}`,800,"center")});rect(377,453,246,48,12,"#6e70ed","#9396ff");txt("クリックしてゲーム開始",500,477,15,"#fff",700,"center");txt("9学期を進み、受験へ · 合格後は浪人エンドレス",500,523,11,"#858aa7",500,"center");}
function drawCombat(){bg();topbar(`${campaignLabel()} · STAGE ${String(g.stage+1).padStart(2,"0")}`);txt(`RUN ${String(run).padStart(2,"0")}`,960,34,11,"#858aa7",500,"right","'DM Mono',monospace");panel(30,75,940,290);const s=currentFoe();txt(`${campaignLabel()} · 放課後の教室`,52,101,11,"#8b91b4",500,"left","'DM Mono',monospace");
// A blackboard and the subject's symbol make each student-themed foe readable at a glance.
rect(115,130,770,202,9,"#1b2730","#3d5960");ctx.fillStyle="#8fae9c";ctx.fillRect(137,147,726,3);txt(s.sub,500,170,11,"#96b6a9",500,"center");txt(s.symbol,500,225,s.symbol.length>4?32:54,s.color,800,"center","'DM Mono','Noto Sans JP',monospace");txt(s.name,500,278,18,"#f1f0fa",800,"center");rect(370,306,260,7,4,"#36394c");rect(370,306,260*g.enemyHp/g.enemyMax,7,4,s.color);txt(`${g.enemyHp} / ${g.enemyMax} HP`,500,327,10,"#aaaec6",500,"center","'DM Mono',monospace");const attackProgress=1-Math.max(0,g.enemyTimer)/g.enemyAttackInterval,attackSoon=g.enemyTimer<1.2;txt(attackSoon?"⚠ 攻撃が迫る！":"敵の攻撃準備",500,348,10,attackSoon?"#ff8297":"#9ba0bd",700,"center");rect(410,359,180,4,2,"#36394c");rect(410,359,180*attackProgress,4,2,attackSoon?"#ff718f":"#e3bd68");
panel(30,378,940,58);txt("自分",50,399,11,"#9ba0be",500);txt(`HP  ${g.hp} / ${g.maxHp}`,120,399,12,"#ff8a9e",700);rect(220,393,176,10,5,"#35384b");rect(220,393,176*g.hp/g.maxHp,10,5,"#ee718b");txt(`MP  ${g.mp} / ${g.maxMp}`,425,399,12,"#8eb4ff",700);rect(527,393,130,10,5,"#35384b");rect(527,393,130*g.mp/g.maxMp,10,5,"#789bea");txt(`回避 ${g.dodge}%`,680,399,11,"#8eb4ff",600);txt(`防御 ${g.armor+(g.shield?` +${g.shield}`:"")}`,797,399,11,"#7cd9c5",600);txt(`敵の行動まで ${Math.max(0,g.enemyTimer).toFixed(1)} 秒`,950,419,10,"#f0c879",500,"right","'DM Mono',monospace");
panel(30,448,940,38);txt(g.cooldown>0?`${g.log}　 ·　 行動回復まで ${g.cooldown.toFixed(1)} 秒`:g.log,48,467,11,g.cooldown>0?"#f0c879":"#b8bad0",500);
txt("手札 · カードを選ぶ",42,510,11,"#9399b8",500,"left","'DM Mono',monospace");txt(`山札 ${g.pile.length}  ·  捨札 ${g.discard.length}  ·  戦闘 ${Math.floor(g.seconds)}秒`,957,510,10,"#777d9d",500,"right","'DM Mono',monospace");handRects=[];const count=g.hand.length,cw=Math.min(166,Math.floor(900/Math.max(5,count))),gap=10,total=count*cw+Math.max(0,count-1)*gap,start=(W-total)/2;
g.hand.forEach((id,i)=>{const c=cards[id],x=start+i*(cw+gap),y=529,w=cw,h=82,locked=g.cooldown>0||(c.mp||0)>g.mp;handRects.push({x,y,w,h});rect(x,y,w,h,9,locked?"#191b29":"#20243a",locked?"#34364a":c.color);txt(c.symbol,x+16,y+22,18,c.color,800);txt(`${c.cost} SEC`,x+w-10,y+17,9,c.cost===0?"#82dbc2":"#e4c879",500,"right","'DM Mono',monospace");txt(c.name,x+12,y+43,11,"#f1f1fb",700);txt(c.desc,x+12,y+64,9,"#a0a4bb",500);if(locked){ctx.fillStyle="#0c0e1770";ctx.fillRect(x,y,w,h)}});
if(g.cooldown>0){rect(337,494,326,4,2,"#33364a");rect(337,494,326*Math.min(1,g.cooldown/2),4,2,"#f0c879")}}
function drawUpgrade(){bg();topbar(`小休憩 · ${campaignLabel()} 修了`);panel(100,95,800,450);txt("✦",500,153,28,"#f0c879",500,"center");txt("よく頑張った！",500,195,28,"#f2f1ff",800,"center");txt("次の学期に備えて、強化をひとつ選ぼう。",500,232,13,"#aeb2cc",500,"center");choiceRects=[];g.choices.forEach((p,i)=>{const x=143+i*245,y=289,w=214,h=165;choiceRects.push({x,y,w,h});rect(x,y,w,h,12,"#20243a","#474d70");txt(`${i+1}`,x+18,y+19,10,"#858bb2",500,"left","'DM Mono',monospace");txt(p.icon,x+w/2,y+58,29,"#d9cbff",700,"center");txt(p.name,x+w/2,y+99,14,"#f2f1ff",800,"center");txt(p.desc,x+w/2,y+130,10,"#a5a9c0",500,"center");});txt(`討伐 ${g.kills}体 · HP ${g.hp}/${g.maxHp} · MP ${g.mp}/${g.maxMp}`,500,492,11,"#888eac",500,"center","'DM Mono',monospace");}
function drawEvent(){bg();topbar("SCHOOL LIFE · EVENT");panel(140,115,720,390);const e=g.event;txt(e.icon,500,185,48,"#f0c879",700,"center");txt(e.name,500,248,26,"#f2f1ff",900,"center");txt(e.text,500,300,14,"#b5b9d0",500,"center");txt(e.result,500,344,13,"#8fe0c5",700,"center");eventRect={x:380,y:410,w:240,h:48};rect(eventRect.x,eventRect.y,eventRect.w,eventRect.h,12,"#6e70ed","#9396ff");txt("次へ進む",500,434,14,"#fff",700,"center");}
function drawEnd(victory){bg();topbar(victory?"受験合格 · CLEAR":"GAME OVER");panel(145,120,710,390);txt(victory?"☀":"✕",500,190,48,victory?"#f0c879":"#ed668e",700,"center");txt(victory?"高校生活、そして受験を突破！":"力尽きてしまった…",500,252,26,"#f2f1ff",900,"center");txt(victory?"ここからはエンドコンテンツ。浪人生活に挑む？":"今回の旅はここで終了。次は一年生から。",500,293,13,"#aeb2cc",500,"center");txt(`到達：${campaignLabel()} · 討伐 ${g.kills}体`,500,332,12,"#9298b8",500,"center","'DM Mono',monospace");endRects=[];if(victory){endRects=[{x:330,y:374,w:340,h:48,action:"ronin"},{x:380,y:438,w:240,h:40,action:"restart"}];rect(330,374,340,48,12,"#6e70ed","#9396ff");txt("浪人1年目を始める →",500,398,14,"#fff",700,"center");rect(380,438,240,40,10,"#20243a","#474d70");txt("最初からやり直す",500,458,12,"#c4c7d8",600,"center")}else{endRects=[{x:380,y:405,w:240,h:48,action:"restart"}];rect(380,405,240,48,12,"#6e70ed","#9396ff");txt("もう一度、挑戦する",500,429,14,"#fff",700,"center")}}
function hit(r){return pointer.x>=r.x&&pointer.x<=r.x+r.w&&pointer.y>=r.y&&pointer.y<=r.y+r.h}
engine.registerScene("title",{onUpdate(){if(pointer.clicked||INPUT.pressed("Enter")||INPUT.pressed("Space")){pointer.clicked=false;fresh()}},onRender(){animTime+=.016;drawTitle()}});
engine.registerScene("combat",{onUpdate(dt){if(pointer.clicked){const i=handRects.findIndex(hit);if(i>=0)play(i);pointer.clicked=false}else{for(let i=0;i<Math.min(5,g?.hand.length||0);i++)if(INPUT.pressed(`Digit${i+1}`))play(i)}if(!g||engine.currentSceneName!=="combat")return;g.seconds+=dt;if(g.cooldown>0){g.cooldown=Math.max(0,g.cooldown-dt);if(g.cooldown===0&&g.hand.length<5)draw(1)}g.enemyTimer-=dt;if(g.enemyTimer<=0)enemyTurn()},onRender(){drawCombat()}});
engine.registerScene("upgrade",{onUpdate(){if(pointer.clicked){const i=choiceRects.findIndex(hit);if(i>=0)pickPerk(i);pointer.clicked=false}else for(let i=0;i<3;i++)if(INPUT.pressed(`Digit${i+1}`))pickPerk(i)},onRender(){drawUpgrade()}});
engine.registerScene("event",{onUpdate(){if(pointer.clicked){if(eventRect&&hit(eventRect))showUpgrade();pointer.clicked=false}else if(INPUT.pressed("Enter")||INPUT.pressed("Space"))showUpgrade()},onRender(){drawEvent()}});
engine.registerScene("over",{onUpdate(){if(pointer.clicked||INPUT.pressed("Enter")||INPUT.pressed("Space")){pointer.clicked=false;fresh()}else pointer.clicked=false},onRender(){drawEnd(false)}});
engine.registerScene("victory",{onUpdate(){if(pointer.clicked){const selected=endRects.find(hit);pointer.clicked=false;if(selected?.action==="ronin"){g.stage=10;beginStage();engine.switchScene("combat")}else if(selected?.action==="restart")fresh()}else if(INPUT.pressed("Enter")||INPUT.pressed("Space")){g.stage=10;beginStage();engine.switchScene("combat")}},onRender(){drawEnd(true)}});
engine.start("title");
