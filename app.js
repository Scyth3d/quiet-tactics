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
let puzzles=[],current,game,solverColor='w',solutionIndex=0,selected=null,answered=false,loading=false,lastId='',deck=[],manifest={shards:[]},puzzleFailed=false,ratingDelta=0,analysisMode=false,evalTimer=null;
let engine=null,engineReady=null,engineReadyResolve=null,engineReadyReject=null,engineSearching=false,engineQueuedFen=null,engineActiveFen=null,engineBestInfo=null,engineBestMove=null;
let analysisHistory=[],analysisIndex=0;
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
function selectSquare(square){clearSelection();if((answered&&!analysisMode)||(!analysisMode&&game.turn()!==solverColor))return;const piece=game.get(square.dataset.square),activeColor=analysisMode?game.turn():solverColor;if(!piece||piece.color!==activeColor)return;selected=square;square.classList.add('selected');game.moves({square:square.dataset.square,verbose:true}).forEach(move=>{const target=document.querySelector('[data-square="'+move.to+'"]');if(target)target.classList.add(move.captured?'capture':'legal')})}
function clickSquare(square){
  if(answered&&!analysisMode)return;
  if(!selected){hideFeedback();selectSquare(square);return}
  if(square===selected){clearSelection();hideFeedback();return}
  const targetPiece=game.get(square.dataset.square);
  if(targetPiece?.color===(analysisMode?game.turn():solverColor)){clearSelection();hideFeedback();return}
  const from=selected.dataset.square;
  const legalMove=game.moves({square:from,verbose:true}).find(move=>move.to===square.dataset.square);
  if(!legalMove){clearSelection();hideFeedback();return}
  const uci=from+square.dataset.square+(legalMove.promotion||'');
  if(analysisMode){
    clearSelection();const move=uciMove(game,uci);if(!move)return;
    analysisHistory=analysisHistory.slice(0,analysisIndex+1);
    analysisHistory.push({fen:game.fen(),san:move.san});analysisIndex=analysisHistory.length-1;
    renderBoard();updateAnalysisNavigation();scheduleEngineEvaluation();return
  }
  const expected=current.solution[solutionIndex];
  clearSelection();
  if(uci!==expected){
    if(!puzzleFailed){puzzleFailed=true;state.solved++;state.rating=Math.max(400,state.rating-12);ratingDelta=-12;save()}
    showFeedback(false,'That is not the puzzle move. Rating −12. You can keep trying.');return
  }
  if(!uciMove(game,uci)){return}
  solutionIndex++;renderBoard();
  if(solutionIndex>=current.solution.length){finishPuzzle();return}
  showFeedback(true,'Correct. Follow the line.');setTimeout(playOpponentReply,420)
}
function playOpponentReply(){if(answered||solutionIndex>=current.solution.length)return;const reply=current.solution[solutionIndex];if(!uciMove(game,reply)){showFeedback(false,'This puzzle line could not be loaded.');answered=true;return}solutionIndex++;renderBoard();if(solutionIndex>=current.solution.length)finishPuzzle();else showFeedback(true,'Opponent replied. Find the next move.')}
function finishPuzzle(){answered=true;if(!puzzleFailed){state.solved++;state.correct++;state.rating+=12;ratingDelta=12;save();showFeedback(true,'Puzzle complete. Rating +12.')}else showFeedback(true,'Puzzle complete after retry.');enterAnalysisMode()}
function revealSolution(){
  if(analysisMode)return;
  const solvedGame=new Chess(current.fen),moves=[],history=[{fen:solvedGame.fen(),san:'Start'}];
  for(const uci of current.solution){const move=uciMove(solvedGame,uci);if(!move)break;moves.push(move.san);history.push({fen:solvedGame.fen(),san:move.san})}
  const firstMistake=!puzzleFailed;
  if(firstMistake){puzzleFailed=true;state.solved++;state.rating=Math.max(400,state.rating-12);ratingDelta=-12;save()}
  answered=true;clearSelection();game=solvedGame;renderBoard();showSolutionFeedback((moves.join(' ')||'No line available')+(firstMistake?' · Rating −12.':''));enterAnalysisMode(history);
}
function showFeedback(ok,text){$('feedback').classList.remove('hidden','bad','solution');if(!ok)$('feedback').classList.add('bad');$('feedbackIcon').textContent=ok?'✓':'×';$('feedbackTitle').textContent=ok?'Correct':'Not quite';$('feedbackText').textContent=text}
function showSolutionFeedback(text){$('feedback').classList.remove('hidden','bad');$('feedback').classList.add('solution');$('feedbackIcon').textContent='→';$('feedbackTitle').textContent='Solution';$('feedbackText').textContent=text}
function hideFeedback(){$('feedback').classList.add('hidden')}
function enterAnalysisMode(history=null){analysisMode=true;analysisHistory=history||[{fen:game.fen(),san:'Solved position'}];analysisIndex=analysisHistory.length-1;$('analysisBar').classList.remove('hidden');$('analysisHint').textContent='Play either side, then use ← and → to review.';updateAnalysisNavigation();updateEngineEvaluation()}
function formatEvaluation(info){if(Number.isFinite(info.mate))return(info.mate>0?'White mates in ':'Black mates in ')+Math.abs(info.mate);const value=info.cp/100;return(value>0?'+':'')+value.toFixed(2)+' (White POV)'}
function clearEngineArrow(){document.getElementById('engineArrow')?.remove()}
function drawEngineArrow(move){
  clearEngineArrow();if(!move||move.length<4)return;
  const files=filesForBoard(),ranks=ranksForBoard(),from=move.slice(0,2),to=move.slice(2,4);
  const x1=files.indexOf(from[0])+.5,y1=ranks.indexOf(from[1])+.5,x2=files.indexOf(to[0])+.5,y2=ranks.indexOf(to[1])+.5;
  if([x1,y1,x2,y2].some(value=>value<0))return;
  const dx=x2-x1,dy=y2-y1,distance=Math.hypot(dx,dy),arrow=document.createElement('div');
  arrow.id='engineArrow';arrow.className='engine-arrow';arrow.style.left=x1/8*100+'%';arrow.style.top=y1/8*100+'%';arrow.style.width=Math.max(.3,distance-.3)/8*100+'%';arrow.style.transform='translateY(-50%) rotate('+Math.atan2(dy,dx)*180/Math.PI+'deg)';$('board').append(arrow);
}
function updateAnalysisNavigation(){
  const last=Math.max(0,analysisHistory.length-1),moveLabel=analysisIndex?' · '+analysisHistory[analysisIndex].san:'';$('analysisPly').textContent=analysisIndex+' / '+last+moveLabel;
  $('analysisBack').disabled=!analysisMode||analysisIndex===0;$('analysisForward').disabled=!analysisMode||analysisIndex>=last;
}
function navigateAnalysis(direction){
  if(!analysisMode)return;const next=analysisIndex+direction;if(next<0||next>=analysisHistory.length)return;
  analysisIndex=next;game=new Chess(analysisHistory[analysisIndex].fen);clearSelection();renderBoard();updateAnalysisNavigation();scheduleEngineEvaluation();
}
function parseEngineInfo(line){
  if(!line.startsWith('info ')||!line.includes(' score '))return null;
  const depth=Number(line.match(/\bdepth (\d+)/)?.[1]||0),score=line.match(/\bscore (cp|mate) (-?\d+)/);
  if(!score)return null;
  const multiplier=engineActiveFen?.split(' ')[1]==='b'?-1:1;
  return score[1]==='mate'?{mate:Number(score[2])*multiplier,depth}:{cp:Number(score[2])*multiplier,depth};
}
function showEngineResult(){
  if(!analysisMode||!engineBestInfo||game.fen()!==engineActiveFen)return;
  $('engineEval').textContent=formatEvaluation(engineBestInfo)+' · depth '+engineBestInfo.depth;
  drawEngineArrow(engineBestMove);
}
function beginQueuedEngineSearch(){
  if(!engine||!engineQueuedFen||!analysisMode)return;
  engineActiveFen=engineQueuedFen;engineQueuedFen=null;engineBestInfo=null;engineBestMove=null;engineSearching=true;clearEngineArrow();
  $('engineEval').textContent='Analyzing locally…';
  engine.postMessage('position fen '+engineActiveFen);
  engine.postMessage('go depth 15');
}
function handleEngineMessage(event){
  const line=typeof event.data==='string'?event.data:'';
  if(line==='uciok'){engine.postMessage('setoption name Hash value 32');engine.postMessage('isready');return}
  if(line==='readyok'){engineReadyResolve?.();engineReadyResolve=null;return}
  const info=parseEngineInfo(line);if(info){engineBestInfo=info;engineBestMove=line.match(/\bpv\s+([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1]||engineBestMove;showEngineResult()}
  if(line.startsWith('bestmove')){engineBestMove=line.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1]||null;engineSearching=false;if(engineQueuedFen)beginQueuedEngineSearch();else showEngineResult()}
}
function initializeEngine(){
  if(engineReady)return engineReady;
  $('engineEval').textContent='Loading local engine…';
  engineReady=new Promise((resolve,reject)=>{engineReadyResolve=resolve;engineReadyReject=reject});
  try{
    engine=new Worker('assets/stockfish/stockfish-19-lite-single.js');
    engine.onmessage=handleEngineMessage;
    engine.onerror=()=>{engineReadyReject?.(new Error('Stockfish failed to load'));engineReadyReject=null;$('engineEval').textContent='Local engine unavailable'};
    engine.postMessage('uci');
  }catch(error){engineReadyReject?.(error);engineReadyReject=null;$('engineEval').textContent='Local engine unavailable'}
  return engineReady;
}
async function updateEngineEvaluation(){
  if(!analysisMode)return;
  try{await initializeEngine()}catch{return}
  if(!analysisMode)return;
  engineQueuedFen=game.fen();
  if(engineSearching)engine.postMessage('stop');else beginQueuedEngineSearch();
}
function stopEngineEvaluation(){clearTimeout(evalTimer);engineQueuedFen=null;engineBestInfo=null;engineBestMove=null;clearEngineArrow();if(engineSearching&&engine)engine.postMessage('stop')}
function scheduleEngineEvaluation(){clearTimeout(evalTimer);evalTimer=setTimeout(updateEngineEvaluation,450)}
function updateStats(){const accuracy=state.solved?Math.round(state.correct/state.solved*100):null;$('rating').textContent=state.rating;$('ratingChange').textContent=(ratingDelta>0?'+':'')+ratingDelta;$('ratingChange').style.color=ratingDelta<0?'#ec8890':'#63c999';$('solvedLabel').textContent=state.solved+' solved';$('accuracyLabel').textContent=accuracy===null?'— accuracy':accuracy+'% accuracy';$('sessionSolved').textContent=state.solved;$('sessionAccuracy').textContent=accuracy===null?'—':accuracy+'%';$('ratingMeter').style.width=Math.min(100,Math.max(5,(state.rating-800)/10))+'%'}
function save(){localStorage.setItem('qt',JSON.stringify(state));updateStats()}
function resetProgress(){if(!confirm('Reset your rating to 1200 and clear all statistics?'))return;state={rating:1200,solved:0,correct:0,streak:0};ratingDelta=0;localStorage.removeItem('qtRecent');recentIds=[];save();hideFeedback()}
async function loadPuzzle(){if(loading)return;loading=true;$('newPuzzleBtn').textContent='Loading…';const wantQuiet=Math.random()*100>Number($('mixSlider').value);await ensurePool(wantQuiet);current=choosePuzzle(wantQuiet);lastId=current.id;game=new Chess(current.fen);solverColor=game.turn();solutionIndex=0;answered=false;analysisMode=false;analysisHistory=[];analysisIndex=0;puzzleFailed=false;ratingDelta=0;stopEngineEvaluation();$('analysisBar').classList.add('hidden');updateAnalysisNavigation();updateStats();clearSelection();hideFeedback();renderBoard();$('positionType').textContent='INTENDED: '+(isQuiet(current)?'QUIET POSITION':'TACTICAL POSITION');$('moveCount').textContent=(solverColor==='w'?'WHITE':'BLACK')+' TO MOVE · '+current.id;$('newPuzzleBtn').textContent='↻ New position';loading=false}

puzzles=rawPuzzles.map(prepare).filter(Boolean);
$('mixSlider').addEventListener('input',event=>$('mixValue').textContent=event.target.value+'%');
$('newPuzzleBtn').addEventListener('click',loadPuzzle);
$('nextPuzzleBtn').addEventListener('click',loadPuzzle);
$('showBtn').addEventListener('click',revealSolution);
$('noTacticBtn').addEventListener('click',()=>{
  if(answered)return;clearSelection();
  if(isQuiet(current)){
    answered=true;
    if(!puzzleFailed){state.solved++;state.correct++;state.rating+=12;ratingDelta=12;showFeedback(true,'Correct — there is no forcing tactic. Rating +12.')}else showFeedback(true,'Correct — there is no forcing tactic. Completed after retry.');
    save();enterAnalysisMode();return;
  }
  const firstMistake=!puzzleFailed;
  if(firstMistake){puzzleFailed=true;state.solved++;state.rating=Math.max(400,state.rating-12);ratingDelta=-12;save()}
  showFeedback(false,firstMistake?'There is a tactic in this position. Rating −12. You can keep trying.':'There is a tactic in this position. You can keep trying.');
});
$('resetBtn').addEventListener('click',resetProgress);
$('resetRatingBtn').addEventListener('click',resetProgress);
$('analysisBack').addEventListener('click',()=>navigateAnalysis(-1));
$('analysisForward').addEventListener('click',()=>navigateAnalysis(1));
document.addEventListener('keydown',event=>{if(event.code==='Space'){event.preventDefault();$('showBtn').click()}if(!event.ctrlKey&&!event.metaKey&&!event.altKey&&event.key.toLowerCase()==='n')loadPuzzle();if(analysisMode&&event.key==='ArrowLeft'){event.preventDefault();navigateAnalysis(-1)}if(analysisMode&&event.key==='ArrowRight'){event.preventDefault();navigateAnalysis(1)}});
async function initialize(){try{const response=await fetch('data/manifest.json');if(response.ok)manifest=await response.json()}catch{}updateStats();loadPuzzle()}
initialize();
