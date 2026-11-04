import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Clearance } from './Telemetry';
import { Ghosts } from './Airspace';
import type { InsertionRecord, SolveView, ProgressView } from '../api/types.gen';
afterEach(cleanup);
const record: InsertionRecord = {id:'r1',flight_id:'a',callsign:'XAT417',filed_at_s:0,cleared_at_s:0,outcome:'cleared',verified:true,message:['CLEARED VIA TEST','MAINTAIN FL370'],trajectory:null,metrics:{},attempts:[],backend:'pbit_emulator'};
describe('clearance safety boundary',()=>{
  it('does not display a clearance before independent verification',()=>{
    render(<Clearance record={null}/>);
    expect(screen.getByText('AWAITING VERIFICATION')).toBeInTheDocument();
    expect(screen.queryByText('VERIFIED CLEARANCE')).not.toBeInTheDocument();
  });
  it('only shows a verified message as a clearance',()=>{
    render(<Clearance record={record}/>);
    expect(screen.getByText('VERIFIED CLEARANCE')).toBeInTheDocument();
    expect(screen.getByText('MAINTAIN FL370')).toBeInTheDocument();
  });
  it('labels held results without presenting clearance text',()=>{
    render(<Clearance record={{...record,verified:false,outcome:'held',message:['No verified candidate']}}/>);
    expect(screen.getByText('NO CLEARANCE ISSUED')).toBeInTheDocument();
    expect(screen.queryByText('VERIFIED CLEARANCE')).not.toBeInTheDocument();
  });
});
it('draws only observed active candidate bits, including multi-hot state',()=>{
  const path={points:[[-50,50,370],[-20,52,370]],times_s:[0,100],theta:[0,0],chi:[0,0]};
  const solve:SolveView={id:'s',flight_id:'a',callsign:'XAT417',attempt:1,reason:'test',nominal:path,candidates:[path,path],candidate_feasible:[true,true],conflicts_with:[],metrics:{},terms:{}};
  const progress:ProgressView={sweep:1,requested_sweeps:10,beta:.2,energy:2,elapsed_ms:1,feasible_index:null,active_candidates:[[],[0,1]],capture_beta:null};
  const {container,rerender}=render(<svg><Ghosts solve={solve} progress={progress}/></svg>);
  expect(container.querySelectorAll('path')).toHaveLength(2);
  rerender(<svg><Ghosts solve={solve} progress={{...progress,active_candidates:[[],[]]}}/></svg>);
  expect(container.querySelectorAll('path')).toHaveLength(0);
});
