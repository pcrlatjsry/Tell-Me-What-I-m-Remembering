const pool = require(__dirname+'/pool');

// =========================== Query ================================ //
exports.createSession = async function(){
    console.log('======================[createSession]=====================');
    var ret=-1
    //insert session log
    var query='';
    query+='INSERT INTO GCP.SESSION_LOG () VALUES()';
    var[rows,fields]=await pool.query(query)
  
    //select session seq
    var query='';
    query+='SELECT max(seq) as seq from GCP.SESSION_LOG ';
    var[rows,fields]=await pool.query(query)
    // console.log('session_seq:'+rows[0]['seq'])
    var session_seq=rows[0]['seq']
    
    
    //get Random medical seq medical text 
    // query='';
    // query+=' SELECT max(seq) as max_seq FROM MEDICAL_TEXT '
    // var[rows,fields]=await pool.query(query)
    // var medical_text_max_seq = rows[0]['max_seq']

    // var mediacal_text_seq
    // var getMedicalTextSeq = function (min, max) {
    //   min = Math.ceil(min);
    //   max = Math.floor(max);
    //   return Math.floor(Math.random() * (max - min)) + min; 
    // }
    // if ( medical_text_max_seq == 1 ){
    //   mediacal_text_seq = medical_text_max_seq
    // }
    // else{
    //   mediacal_text_seq = getMedicalTextSeq(1, medical_text_max_seq + 1 )
    // }
    // get medical text
    query='';
    query+=' SELECT context FROM MEDICAL_TEXT '
    query+=' order by RAND() LIMIT 1 '
    var[rows,fields]=await pool.query(query)
    var medical_text='"'+rows[0]['context']+'"'
  
    //insert record Log
    query='';
    query+='INSERT INTO GCP.RECORD_LOG';
    query+=' (session_seq, repeat_seq, context, wav_path, stt_result)';
    query+=' VALUES('+session_seq+', 1, '+medical_text+', NULL, NULL)';
  
    // console.log(query)
    var[rows,fields]=await pool.query(query)
  
    if (rows!=undefined){
      ret=session_seq
    }
    return ret;
  }
  
  exports.getTTScontext = async function(session_seq){
    console.log('======================[getTTScontext]=====================');
    var query=''
    query=' SELECT max(repeat_seq) as repeat_seq FROM RECORD_LOG';
    query+=' WHERE session_seq = '+session_seq;
    console.log(query)
    var[rows,fields]=await pool.query(query)
    var max_repeat=rows[0]['repeat_seq']
  
    if (max_repeat == 1){
      query=''
      query=' SELECT context FROM RECORD_LOG';
      query+=' WHERE session_seq = '+session_seq;
      console.log(query)
    }
    else{
      query=''
      query=' SELECT context FROM RECORD_LOG';
      query+=' WHERE session_seq = '+session_seq;
      query+=' AND  repeat_seq = '+max_repeat;
      console.log(query)
    }
    var[rows,fields]=await pool.query(query)
  
    return rows[0]['context']
    
  }
  
  exports.insertRecordLog = async function (session_seq,repeat_seq,stt_result){
    console.log('======================[insertRecordLog]=====================');
    var query=''
    query+=' INSERT INTO GCP.RECORD_LOG'
    query+=' (session_seq, repeat_seq, context, wav_path, stt_result)'
    query+=' VALUES('+session_seq+','+repeat_seq+','+'"'+stt_result+'"'+', NULL, NULL)'
    console.log(query)
    var[rows,fields]=await pool.query(query)
    
  }
  
  
  exports.updateRecordLog = async function (session_seq,repeat_seq,wav_path=null,stt_result=null){
    console.log('======================[updateRecordLog]=====================');
    var query=''
    query+=' UPDATE GCP.RECORD_LOG'
    query+=' SET '
    if (wav_path != null){
      query+=' wav_path='+"'"+wav_path+"'"
    }
    if (stt_result != null){
      query+=' stt_result='+'"'+stt_result+'"'
    }
    query+=' WHERE session_seq='+session_seq
    query+=' AND repeat_seq='+repeat_seq
    console.log(query)
  
    var[rows,fields]=await pool.query(query)
    
  }
  
  