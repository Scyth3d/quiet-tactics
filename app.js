const rawPuzzles=[
  {id:'quiet-1',fen:'r1bqk2r/pppp1ppp/2n2n2/8/4P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 2 6',solution:['f1e1'],themes:['quietMove']},
  {id:'quiet-2',fen:'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',solution:['g1f3'],themes:['opening','quietMove']},
  {id:'quiet-3',fen:'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',solution:['g1f3'],themes:['opening','quietMove']},
  {id:'quiet-4',fen:'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 1 2',solution:['c2c4'],themes:['opening','quietMove']},
  {id:'m5h82',fen:'1r1r4/3P2bk/p1B4p/1pP2p2/4p2R/7R/P4PPP/6K1 b - - 0 1',solution:['b8c8','h4e4','c8c6'],themes:['endgame','short','advantage','pin','backRankMate']},
  {id:'VAfZj',fen:'5r1k/1p4pp/pB4p1/1P6/P2P2P1/1Q2Pr1q/R4P2/6KR b - - 1 1',solution:['f3g3','f2g3','f8f1'],themes:['clearance','mateIn2','middlegame','short','sacrifice','kingsideAttack']},
  {id:'00sHx',fen:'q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17',moves:['e8d7','a2e6','d7d8','f7f8'],themes:['mate','mateIn2','middlegame','short']},
  {id:'00sJ9',fen:'r3r1k1/p4ppp/2p2n2/1p6/3P1qb1/2NQR3/PPB2PP1/R1B3K1 w - - 5 18',moves:['e3g3','e8e1','g1h2','e1c1','a1c1','f4h6','h2g1','h6c1'],themes:['advantage','attraction','fork','middlegame','sacrifice','veryLong']},
  {id:'00sJb',fen:'Q1b2r1k/p2np2p/5bp1/q7/5P2/4B3/PPP3PP/2KR1B1R w - - 1 17',moves:['d1d7','a5e1','d7d1','e1e3','c1b1','e3b6'],themes:['advantage','fork','long']},
  {id:'00sO1',fen:'1k1r4/pp3pp1/2p1p3/4b3/P3n1P1/8/KPP2PN1/3rBR1R b - - 2 31',moves:['b8c7','e1a5','b7b6','f1d1'],themes:['advantage','discoveredAttack','master','middlegame','short']}
];
const tacticalThemes=new Set(['advantage','mate','mateIn2','backRankMate','fork','pin','sacrifice','discoveredAttack']);
const quietThemes=new Set(['quietMove','opening','endgame','pawnEndgame','rookEndgame','bishopEndgame','knightEndgame']);
const $=id=>document.getElementById(id);
let state;try{state=JSON.parse(localStorage.getItem('qt'))}catch{}state=state||{rating:1200,solved:0,correct:0,streak:0};
let puzzles=[],current,game,solverColor='w',solutionIndex=0,selected=null,answered=false,loading=false,lastId='',deck=[],manifest={shards:[]};
const loadedShards=new Set();let recentIds=[];try{recentIds=JSON.parse(localStorage.getItem('qtRecent'))||[]}catch{}

function uciMove(chess,uci){return chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'})}
function prepare(raw){if(raw.solution)return {...raw};const chess=new Chess(raw.fen);if(!uciMove(chess,raw.moves[0]))return null;return {...raw,fen:chess.fen(),solution:raw.moves.slice(1)}}
function isQuiet(p){if(p.kind)return p.kind==='quiet';if(!p.themes.some(t=>quietThemes.has(t))||p.themes.some(t=>tacticalThemes.has(t)))return false;const chess=new Chess(p.fen),move=uciMove(chess,p.solution[0]);return !!move&&!move.captured&&!move.san.includes('+')&&!move.san.includes('#')}
function shuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function choosePuzzle(wantQuiet){const recent=new Set(recentIds);let pool=puzzles.filter(p=>isQuiet(p)===wantQuiet&&!recent.has(p.id));if(!pool.length){recentIds=[];pool=puzzles.filter(p=>isQuiet(p)===wantQuiet&&p.id!==lastId)}if(!pool.length)pool=puzzles.filter(p=>p.id!==lastId);if(!deck.length||!deck.some(p=>pool.includes(p)))deck=shuffle(pool);const choice=deck.find(p=>pool.includes(p))||pool[0];deck=deck.filter(p=>p!==choice);recentIds.push(choice.id);recentIds=recentIds.slice(-5000);localStorage.setItem('qtRecent',JSON.stringify(recentIds));return choice}
async function ensurePool(wantQuiet){const kind=wantQuiet?'quiet':'tactical',available=manifest.shards.filter(s=>s.kind===kind&&!loadedShards.has(s.path));if(!available.length)return;const shard=available[Math.floor(Math.random()*available.length)];try{const response=await fetch(shard.path);if(!response.ok)throw Error();const entries=await response.json();puzzles.push(...entries);loadedShards.add(shard.path)}catch{}}

function filesForBoard(){return solverColor==='w'?['a','b','c','d','e','f','g','h']:['h','g','f','e','d','c','b','a']}
function ranksForBoard(){return solverColor==='w'?['8','7','6','5','4','3','2','1']:['1','2','3','4','5','6','7','8']}
function updateCoordinates(){const files=filesForBoard(),ranks=ranksForBoard();document.querySelectorAll('.file-labels span').forEach((el,i)=>el.textContent=files[i]);document.querySelectorAll('.rank-labels span').forEach((el,i)=>el.textContent=ranks[i])}
function renderBoard(){const board=$('board'),files=filesForBoard(),ranks=ranksForBoard();board.replaceChildren();for(const rank of ranks)for(const file of files){const squareName=file+rank,square=document.createElement('div'),piece=game.get(squareName);square.className='square '+(((file.charCodeAt(0)-97+Number(rank))%2)?'light':'dark');square.dataset.square=squareName;if(piece){const img=document.createElement('img');img.className='piece-image';img.alt=(piece.color==='w'?'White ':'Black ')+piece.type;img.src='https://lichess1.org/assets/piece/cburnett/'+piece.color+piece.type.toUpperCase()+'.svg';img.onerror=()=>{img.style.display='none';square.textContent={wp:'♙',wn:'♘',wb:'♗',wr:'♖',wq:'♕',wk:'♔',bp:'♟',bn:'♞',bb:'♝',br:'♜',bq:'♛',bk:'♚'}[piece.color+piece.type]};square.append(img)}square.addEventListener('click',()=>clickSquare(square));board.append(square)}updateCoordinates()}
function clearSelection(){document.querySelectorAll('.selected,.legal,.capture').forEach(el=>el.classList.remove('selected','legal','capture'));selected=null}
function selectSquare(square){clearSelection();if(answered||game.turn()!==solverColor)return;const piece=game.get(square.dataset.square);if(!piece||piece.color!==solverColor)return;selected=square;square.classList.add('selected');game.moves({square:square.dataset.square,verbose:true}).forEach(move=>{const target=document.querySelector('[data-square="'+move.to+'"]');if(target)target.classList.add(move.captured?'capture':'legal')})}
function clickSquare(square){
  if(answered)return;
  if(!selected){hideFeedback();selectSquare(square);return}
  if(square===selected){clearSelection();hideFeedback();return}
  const targetPiece=game.get(square.dataset.square);
  if(targetPiece?.color===solverColor){clearSelection();hideFeedback();return}
  const from=selected.dataset.square;
  const legalMove=game.moves({square:from,verbose:true}).find(move=>move.to===square.dataset.square);
  if(!legalMove){clearSelection();hideFeedback();return}
  const uci=from+square.dataset.square+(legalMove.promotion||'');
  const expected=current.solution[solutionIndex];
  clearSelection();
  if(uci!==expected){showFeedback(false,'That is not the puzzle move. Try again.');return}
  if(!uciMove(game,uci)){return}
  solutionIndex++;renderBoard();
  if(solutionIndex>=current.solution.length){finishPuzzle();return}
  showFeedback(true,'Correct. Follow the line.');setTimeout(playOpponentReply,420)
}
function playOpponentReply(){if(answered||solutionIndex>=current.solution.length)return;const reply=current.solution[solutionIndex];if(!uciMove(game,reply)){showFeedback(false,'This puzzle line could not be loaded.');answered=true;return}solutionIndex++;renderBoard();if(solutionIndex>=current.solution.length)finishPuzzle();else showFeedback(true,'Opponent replied. Find the next move.')}
function finishPuzzle(){answered=true;state.solved++;state.correct++;state.rating+=12;save();showFeedback(true,'Puzzle complete.')}
function solutionSan(){const chess=new Chess(current.fen),moves=[];for(const uci of current.solution){const move=uciMove(chess,uci);if(!move)break;moves.push(move.san)}return moves.join(' ')||'No line available'}
function showFeedback(ok,text){$('feedback').classList.remove('hidden','bad');if(!ok)$('feedback').classList.add('bad');$('feedbackIcon').textContent=ok?'✓':'×';$('feedbackTitle').textContent=ok?'Correct':'Not quite';$('feedbackText').textContent=text}
function hideFeedback(){$('feedback').classList.add('hidden')}
function updateStats(){const accuracy=state.solved?Math.round(state.correct/state.solved*100):null;$('rating').textContent=state.rating;$('solvedLabel').textContent=state.solved+' solved';$('accuracyLabel').textContent=accuracy===null?'— accuracy':accuracy+'% accuracy';$('sessionSolved').textContent=state.solved;$('sessionAccuracy').textContent=accuracy===null?'—':accuracy+'%';$('ratingMeter').style.width=Math.min(100,Math.max(5,(state.rating-800)/10))+'%'}
function save(){localStorage.setItem('qt',JSON.stringify(state));updateStats()}
async function loadPuzzle(){if(loading)return;loading=true;$('newPuzzleBtn').textContent='Loading…';const wantQuiet=Math.random()*100>Number($('mixSlider').value);await ensurePool(wantQuiet);current=choosePuzzle(wantQuiet);lastId=current.id;game=new Chess(current.fen);solverColor=game.turn();solutionIndex=0;answered=false;clearSelection();hideFeedback();renderBoard();$('positionType').textContent='INTENDED: '+(isQuiet(current)?'QUIET POSITION':'TACTICAL POSITION');$('moveCount').textContent=(solverColor==='w'?'WHITE':'BLACK')+' TO MOVE · '+current.id;$('newPuzzleBtn').textContent='↻ New position';loading=false}

puzzles=rawPuzzles.map(prepare).filter(Boolean);
$('mixSlider').addEventListener('input',event=>$('mixValue').textContent=event.target.value+'%');
$('newPuzzleBtn').addEventListener('click',loadPuzzle);
$('nextPuzzleBtn').addEventListener('click',loadPuzzle);
$('showBtn').addEventListener('click',()=>{answered=true;clearSelection();showFeedback(true,'Solution: '+solutionSan())});
$('noTacticBtn').addEventListener('click',()=>{if(answered)return;answered=true;clearSelection();state.solved++;if(isQuiet(current)){state.correct++;state.rating+=12;showFeedback(true,'Correct — there is no forcing tactic.')}else{state.rating=Math.max(400,state.rating-12);showFeedback(false,'There is a tactic in this position.')}save()});
$('resetBtn').addEventListener('click',()=>{if(confirm('Reset your rating and statistics?')){state={rating:1200,solved:0,correct:0,streak:0};save()}});
document.addEventListener('keydown',event=>{if(event.code==='Space'){event.preventDefault();$('showBtn').click()}if(event.key==='ArrowRight')loadPuzzle()});
async function initialize(){try{const response=await fetch('data/manifest.json');if(response.ok)manifest=await response.json()}catch{}updateStats();loadPuzzle()}
initialize();
