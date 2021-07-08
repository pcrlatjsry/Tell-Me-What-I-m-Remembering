'use strict';

//connection to socket
const socket = io.connect();

//================= CONFIG =================
// Stream Audio
let bufferSize = 2048,
  AudioContext,
  context,
  processor,
  input,
  globalStream;

//vars
let audioElement = document.querySelector('audio'),
  finalWord = false,
  resultText = document.getElementById('ResultText'),
  removeLastSentence = true,
  streamStreaming = false;

//audioStream constraints
const constraints = {
  audio: true,
  video: false,
};

//================= RECORDING =================

async function initRecording() {
  socket.emit('startGoogleCloudStream', ''); //init socket Google Speech Connection

  streamStreaming = true;
  AudioContext = window.AudioContext || window.webkitAudioContext;
  context = new AudioContext({
    // if Non-interactive, use 'playback' or 'balanced' // https://developer.mozilla.org/en-US/docs/Web/API/AudioContextLatencyCategory
    latencyHint: 'interactive',
  });
  

  processor = context.createScriptProcessor(bufferSize, 1, 1);
  processor.connect(context.destination);
  context.resume();

  var handleSuccess = function (stream) {
    globalStream = stream;
    input = context.createMediaStreamSource(stream);
    input.connect(processor);

    processor.onaudioprocess = function (e) {
      microphoneProcess(e);
    };
  };

  navigator.mediaDevices.getUserMedia(constraints).then(handleSuccess);
}

async function get_steremo_mix(sp,tts_stream,mic_stream){
  var mix_stream=[]
  var duration=mic_stream.length
  var tts_volume=0.2
  
  for(var i=0; i<duration; i++){
    mix_stream[i]=((tts_stream[i+sp]*tts_volume)+mic_stream[i])*.5;
  }
  return mix_stream
}

var start_idx=0
async function microphoneProcess(e) {
  // get channel data && downsampler
  var micBuffer_441k = e.inputBuffer.getChannelData(0);
  var micBuffer = await downsampleBuffer(micBuffer_441k, 44100, 16000);

  // bufferArray -> INT 16 Array
  var int16_ttsBuffer=new Int16Array(ttsBuffer);
  var int16_micBuffer=new Int16Array(micBuffer);
  
  // INT16 Array -> Float32 Array
  let float32_ttsBuffer = new Float32Array(int16_ttsBuffer.length);
  for(let i=0; i<int16_ttsBuffer.length; i++) float32_ttsBuffer[i] = int16_ttsBuffer[i] / (int16_ttsBuffer[i] >= 0 ? 32767 : 32768);

  let float32_micBuffer = new Float32Array(int16_micBuffer.length);
  for(let i=0; i<int16_micBuffer.length; i++) float32_micBuffer[i] = int16_micBuffer[i] / (int16_micBuffer[i] >= 0 ? 32767 : 32768);

  //tuple FLOAT 32 Array -> Stereo Mix (input:2 output:1)
  var mix_stream=await get_steremo_mix(start_idx,float32_ttsBuffer,float32_micBuffer)
  
  start_idx+=int16_micBuffer.length
  

  // //Stereo Mix(FLOAT32) -> Stereo Mix(INT16)
  var stereoBuffer = await downsampleBuffer(mix_stream, 16000, 16000);

  
  var sendBuffer={'stereoBuffer':stereoBuffer.buffer,'fname':audioUrl}
  //Send socket
  socket.emit('binaryData', sendBuffer);
}

//================= INTERFACE =================
var startButton = document.getElementById('startRecButton');
startButton.addEventListener('click', usingStartButton);

var resetButton = document.getElementById('resetButton');
resetButton.addEventListener('click', usingResetButton);

var recordingStatus = document.getElementById('recordingStatus');

//================= Init and play TTS  =================
var repeat_seq // repeat count
var audio = new Audio() // play tts audio object
var session_seq 

function initTTS() {
  $('#text_area').loading();
  repeat_seq = 1
  socket.emit('initServerTTS')
}

function ttsPlay(){
  if ( repeat_seq > 400 ){
    initTTS();
  }
  else{
    var sendData = { session_seq : session_seq , repeat_seq : repeat_seq }
    socket.emit('startGoogleCloudTTS',sendData)
  }
}
//================= Audio stop event  =================
audio.addEventListener('ended', (event) => delayjob(stopProcess,3000));

async function delayjob(func_name,wait_time){ //waiting for residual stt job
  await stopRecording();
  setTimeout(func_name,wait_time);
}
async function resetProcess(){
  stt_result_temp='';
  await resetResultArea();
}
async function stopProcess(){
  var stt_result=resultText.innerText; 

  // data set
  var sendData={}
  if (stt_result.length > 0){
    sendData.stt_result=stt_result
  }
  else{
    sendData.stt_result='No Speech to Text yet'
  }
  sendData.session_seq=session_seq
  sendData.repeat_seq=repeat_seq


  // reset ResultText  
  stt_result_temp='';
  await resetResultArea();
  
  socket.emit('updateRepeatSeq',sendData)
}
  
async function resetResultArea(){
  resultText.lastElementChild.remove();
  let empty = document.createElement('span');
  resultText.appendChild(empty);

}

async function usingStartButton(){
  startButton.style.display='none'
  // recordingStatus.style.visibility = 'visible';
  // resetButton.style.display='inherit'
  initTTS();
  
}

async function usingResetButton(){
  await delayjob(resetProcess,3000);
  initTTS();
  
  // recordingStatus.style.visibility = 'hidden';
  
  // startButton.style.display='none'
  // resetButton.style.display='inherit'
  // recordingStatus.style.visibility = 'visible';
}


//================= Stop button Process  =================
async function stopRecording() {
  streamStreaming = false;
  audio.pause();
  socket.emit('endGoogleCloudStream', '');
  let track = globalStream.getTracks()[0];
  start_idx=0;
  
  track.stop();
  input.disconnect(processor);
  processor.disconnect(context.destination);
  context.close().then(function () {
    input = null;
    processor = null;
    context = null;
    AudioContext = null;
    startButton.disabled = false;
  });
}

//================= SOCKET IO =================
socket.on('connect', function (data) {
  console.log('connected to socket');
  socket.emit('join', 'Server Connected to Client');
});

socket.on('repeatProcess',  async function(){
  await ttsPlay();
  repeat_seq += 1
  console.log("repeat_seq:"+repeat_seq)
});

socket.on('messages', function (data) {
  console.log(data);
});

var stt_result_temp='';
socket.on('speechData', async function (data) {
  var dataFinal = undefined || data.results[0].isFinal;
  var stt_result=data.results[0].alternatives[0].transcript
  removeLastSentence = true;
  
  //clear area && add html
  await resetResultArea();
  await view_resultText(stt_result_temp+stt_result);

  if(dataFinal === true){
    stt_result_temp+=stt_result+' ';
  }
  
  // check scroll
  var scrollObj=document.getElementById("text_area");
  $(scrollObj).stop().animate({ scrollTop: scrollObj.scrollHeight }, 1000);
  
});

socket.on('initClientTTS', function (data) {
  session_seq = data.session_seq
  ttsPlay();
});

var ttsBuffer=[]
var audioUrl
socket.on('playTTS', async function (data) {
  ttsBuffer=data.ttsBuffer

  audioUrl=data.tts_url+data.fileName
  
  audio.src = audioUrl
  audio.playbackRate=1.1;
  await initRecording();

  // recordingStatus.style.visibility = 'visible';
  resetButton.style.display='inherit'
  $('#text_area').loading('stop');

  var playPromise = audio.play();

  if (playPromise !== undefined) {
    playPromise.then(_ => {
    })
    .catch(error => {
    });
  }
}); 

window.onbeforeunload = function () {
  if (streamStreaming) {
    socket.emit('endGoogleCloudStream', '');
  }
};


//======================function======================
var view_resultText =async function(data){
  resultText.lastElementChild.innerText=data;
 }

 var downsampleBuffer = async function (buffer, sampleRate, outSampleRate) {
  if (outSampleRate > sampleRate) {
    throw 'downsampling rate show be smaller than original sample rate';
  }
  var sampleRateRatio = sampleRate / outSampleRate;
  var newLength = Math.round(buffer.length / sampleRateRatio);
  var result = new Int16Array(newLength);
  var offsetResult = 0;
  var offsetBuffer = 0;
  while (offsetResult < result.length) {
    var nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    var accum = 0,
      count = 0;
    for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }

    result[offsetResult] = Math.min(1, accum / count) * 0x7fff;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
};

function capitalize(s) {
  if (s.length < 1) {
    return s;
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}
