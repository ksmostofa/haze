(function(root){
  "use strict";

  function create(total){
    let expected=Math.max(0,Number(total)||0);
    let completed=0;
    let phase="queued";
    let failed=null;
    const completedKeys=new Set();

    function snapshot(){
      return {
        completed,
        total:expected,
        percent:expected?Math.min(100,Math.round(completed/expected*100)):0,
        phase,
        failed,
      };
    }
    return {
      mark(key,nextPhase){
        if(key!=null&&!completedKeys.has(key)){
          completedKeys.add(key);
          completed=Math.min(expected,completed+1);
          phase=nextPhase||String(key);
        }
        return snapshot();
      },
      setPhase(nextPhase){
        if(nextPhase)phase=nextPhase;
        return snapshot();
      },
      fail(error,nextPhase){
        failed=String(error||"Startup failed");
        if(nextPhase)phase=nextPhase;
        return snapshot();
      },
      reset(nextTotal=expected){
        expected=Math.max(0,Number(nextTotal)||0);
        completed=0;phase="queued";failed=null;completedKeys.clear();
        return snapshot();
      },
      snapshot,
    };
  }

  root.HazeLoaderState={create};
})(globalThis);
