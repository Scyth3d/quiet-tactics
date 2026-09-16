#!/usr/bin/env python3
"""Build a 100k static training pack from the public Lichess puzzle database."""
from __future__ import annotations
import argparse, csv, io, json, random, shutil, sys, urllib.request
from pathlib import Path
import chess
import chess.engine
import zstandard

SOURCE = "https://database.lichess.org/lichess_db_puzzle.csv.zst"

def arguments():
    p=argparse.ArgumentParser()
    p.add_argument("--output",type=Path,default=Path("data"))
    p.add_argument("--tactical",type=int,default=50_000)
    p.add_argument("--quiet",type=int,default=50_000)
    p.add_argument("--shard-size",type=int,default=1_000)
    p.add_argument("--candidate-factor",type=int,default=5)
    p.add_argument("--stockfish",default=shutil.which("stockfish") or "/usr/games/stockfish")
    p.add_argument("--depth",type=int,default=10)
    p.add_argument("--max-spread",type=int,default=45)
    p.add_argument("--seed",type=int,default=20260915)
    return p.parse_args()

def stream_rows(url):
    req=urllib.request.Request(url,headers={"User-Agent":"QuietTactics dataset builder"})
    with urllib.request.urlopen(req,timeout=120) as response:
        reader=zstandard.ZstdDecompressor().stream_reader(response)
        yield from csv.reader(io.TextIOWrapper(reader,encoding="utf-8",newline=""))

def reservoir_add(items,item,seen,limit,rng):
    if len(items)<limit: items.append(item)
    else:
        index=rng.randrange(seen)
        if index<limit: items[index]=item

def parse_row(row):
    if len(row)<9:return None
    puzzle_id,fen,moves,rating,_,popularity,plays,themes,game_url=row[:9]
    try:
        board=chess.Board(fen); move_list=moves.split(); setup=chess.Move.from_uci(move_list[0])
        if setup not in board.legal_moves or len(move_list)<2:return None
        return {"id":puzzle_id,"board":board,"moves":move_list,"rating":int(rating),
                "popularity":int(popularity),"plays":int(plays),"themes":themes.split(),"url":game_url}
    except (ValueError,IndexError):return None

def tactical_entry(row):
    board=row["board"].copy();board.push_uci(row["moves"][0])
    return {"id":row["id"],"kind":"tactical","fen":board.fen(),"solution":row["moves"][1:],
            "rating":row["rating"],"themes":row["themes"],"source":row["url"]}

def quiet_candidate(row):
    board=row["board"]
    return board.fullmove_number>=15 and not board.is_check() and len(list(board.legal_moves))>=8 and row["popularity"]>=70

def quiet_entry(row,engine,depth,max_spread):
    board=row["board"].copy()
    try: lines=engine.analyse(board,chess.engine.Limit(depth=depth),multipv=3)
    except (chess.engine.EngineError,chess.engine.EngineTerminatedError):return None
    if len(lines)<3:return None
    scores=[]
    for line in lines:
        score=line["score"].pov(board.turn)
        if score.is_mate() or score.score() is None:return None
        scores.append(score.score())
    if max(scores)-min(scores)>max_spread:return None
    best=lines[0].get("pv",[None])[0]
    if best is None or board.is_capture(best) or best.promotion:return None
    board.push(best)
    if board.is_check():return None
    return {"id":"q-"+row["id"],"kind":"quiet","fen":row["board"].fen(),"solution":[],
            "rating":row["rating"],"themes":["engineQuiet"],"spread":max(scores)-min(scores),"source":row["url"]}

def write_shards(output,tactical,quiet,shard_size,rng):
    output.mkdir(parents=True,exist_ok=True)
    for path in output.glob("*.json"):path.unlink()
    manifest={"version":1,"total":len(tactical)+len(quiet),"shards":[]}
    for kind,entries in (("tactical",tactical),("quiet",quiet)):
        rng.shuffle(entries)
        for number,start in enumerate(range(0,len(entries),shard_size),1):
            chunk=entries[start:start+shard_size];name=f"{kind}-{number:03d}.json"
            (output/name).write_text(json.dumps(chunk,separators=(",",":")),encoding="utf-8")
            ratings=[x["rating"] for x in chunk]
            manifest["shards"].append({"path":f"data/{name}","kind":kind,"count":len(chunk),
                "minRating":min(ratings),"maxRating":max(ratings)})
    (output/"manifest.json").write_text(json.dumps(manifest,indent=2),encoding="utf-8")

def main():
    cfg=arguments();rng=random.Random(cfg.seed);tactical=[];candidates=[];t_seen=q_seen=0
    print("Streaming Lichess puzzle database…",flush=True)
    for raw in stream_rows(SOURCE):
        row=parse_row(raw)
        if not row:continue
        t_seen+=1;reservoir_add(tactical,tactical_entry(row),t_seen,cfg.tactical,rng)
        if quiet_candidate(row):
            q_seen+=1;reservoir_add(candidates,row,q_seen,cfg.quiet*cfg.candidate_factor,rng)
    print(f"Sampled {len(tactical)} tactics and {len(candidates)} quiet candidates",flush=True)
    quiet=[];rng.shuffle(candidates)
    with chess.engine.SimpleEngine.popen_uci(cfg.stockfish) as engine:
        for row in candidates:
            entry=quiet_entry(row,engine,cfg.depth,cfg.max_spread)
            if entry:
                quiet.append(entry)
                if len(quiet)%1000==0:print(f"Accepted {len(quiet)}/{cfg.quiet} quiet positions",flush=True)
                if len(quiet)>=cfg.quiet:break
    if len(tactical)<cfg.tactical or len(quiet)<cfg.quiet:
        raise SystemExit(f"Insufficient positions: tactical={len(tactical)}, quiet={len(quiet)}")
    write_shards(cfg.output,tactical,quiet,cfg.shard_size,rng)
    print(f"Wrote {len(tactical)+len(quiet)} positions",flush=True)

if __name__=="__main__":sys.exit(main())
