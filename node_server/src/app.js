'use strict';

const express = require('express'); // const bodyParser = require('body-parser'); // const path = require('path');
const environmentVars = require('dotenv').config();

const path = require("path")
const audio_root_dir='audio/';
// =========================== GCP module ================================ //
const speech = require('@google-cloud/speech');
const speechClient = new speech.SpeechClient(); // Creates a client
const textToSpeech = require('@google-cloud/text-to-speech');
const textToSpeechClient = new textToSpeech.TextToSpeechClient();
const fs = require('fs');
const util = require('util');

// =========================== Setting port and protocol ================================ //
const app = express();
const port = process.env.PORT || 443;
const tts_url = process.env.TTS_URL

// setting https
const options={
  key: fs.readFileSync('./server.key'),
  cert: fs.readFileSync('./server.crt')
};
const https= require('https').createServer(options,app);

// webScoket 
const io = require('socket.io')(https).listen(https);


// =========================== folder import ================================ //
app.use('/assets', express.static(__dirname + '/public'));
app.use('/session/assets', express.static(__dirname + '/public'));
app.set('view engine', 'ejs');
app.use('/audio',express.static(__dirname + '/audio'));

// =========================== DB connect  ================================ //
const db = require(__dirname+'/db/query');

// =========================== ROUTERS ================================ //

app.get('/', function (req, res) {
  res.render('index', {});
});

app.use('/', function (req, res, next) {
  next();
});

// =========================== SOCKET.IO ================================ //
var ttsBufferArr = []

io.on('connection', function (client) {
  console.log('Client Connected to server');
  let recognizeStream = null;

  client.on('join', function () {
    client.emit('messages', 'Socket Connected to Server');
  });

  client.on('messages', function (data) {
    client.emit('broad', data);
  });

  client.on('startGoogleCloudStream', function (data) {
    startRecognitionStream(this, data);
  });

  client.on('endGoogleCloudStream', function () {
    stopRecognitionStream();
  });

  
  client.on('binaryData', function (data) {
    if (recognizeStream !== null) {
      save_stereo_mix(data)
      recognizeStream.write(data.stereoBuffer);
      }
  });

  client.on('startGoogleCloudTTS', function (data){
    startTextToSpeechStream(this, data);
  });

  client.on('initServerTTS', function (data){
    startInitTextToSpeech(this, data)
  });

  client.on('updateRepeatSeq', async function (data){
    await updateRepeatSeq(this, data)
    client.emit('repeatProcess')
  });

// =========================== GOOGLE CLOUD STT SETTINGS ================================ //
// The encoding of the audio file, e.g. 'LINEAR16'
// The sample rate of the audio file in hertz, e.g. 16000
// The language code to use, e.g. 'en-US'

  const encoding = 'LINEAR16';
  const sampleRateHertz = 16000;
  const languageCode = 'en-GB'; //en-British

  const stt_request = {
    config: {
      encoding: encoding,
      sampleRateHertz: sampleRateHertz,
      languageCode: languageCode,
      profanityFilter: false,
      enableWordTimeOffsets: true,
      enableSpeakerDiarization: false,
      enableAutomaticPunctuation: true,
    },
    interimResults: true, // If you want interim results, set this to true
  };

// =========================== SOCKET.IO.STT.SERVICE ================================ //
  async function updateRepeatSeq(client, data){
    // updataSttresult
    await db.updateRecordLog(data.session_seq,data.repeat_seq,null,data.stt_result)

    // insert Record log table
    await db.insertRecordLog(data.session_seq,data.repeat_seq+1,data.stt_result)
  }

  function startRecognitionStream(client) {
    recognizeStream = speechClient
      .streamingRecognize(stt_request)
      .on('error', console.error)
      .on('data', (data) => {
        process.stdout.write(
          data.results[0] && data.results[0].alternatives[0]
            ? `Transcription: ${data.results[0].alternatives[0].transcript}\n`
            : '\n\nReached transcription time limit, press Ctrl+C\n'
        );
        client.emit('speechData', data);

        // if end of utterance, let's restart stream
        // this is a small hack. After 65 seconds of silence, the stream will still throw an error for speech length limit
        if (data.results[0] && data.results[0].isFinal) {
          stopRecognitionStream();
          startRecognitionStream(client);
        }
      });
  }
  function stopRecognitionStream() {
    if (recognizeStream) {
      recognizeStream.end();
    }
    recognizeStream = null;
  }

// =========================== SOCKET.IO.TTS.SERVICE ================================ //
async function startInitTextToSpeech(client) {
  // create Session 
  var session_seq = await db.createSession()
  var data = {session_seq : session_seq}
  client.emit('initClientTTS',data)
}

async function startTextToSpeechStream(client,data) {
    // Select Context for TTS 
    const text =  await db.getTTScontext(data.session_seq)
    // const text = 'hello world, tell me what i am Remembering';

    // TTS options 
    const languageCode = 'en-GB'; 
    const tts_request = {
      input: {text: text},
      voice: {languageCode: languageCode, ssmlGender: 'FEMALE',name:'en-GB-Standard-F'},
      audioConfig: {audioEncoding: 'LINEAR16', speakingRate: 0.8, sampleRateHertz: 16000},
    };

    // Format mp3 file names
    const date = new Date();
    const filePath = 'tts/';
    const fileName = data.session_seq+'-'+data.repeat_seq+'-'+ dateFormat(date)
    const outputFile = audio_root_dir+filePath + fileName + '.wav'
 
    // Request Google TTS 
    const [response] = await textToSpeechClient.synthesizeSpeech(tts_request);

    // Save response audio to mp3 file
    const writeFile = util.promisify(fs.writeFile);
    await writeFile(outputFile, response.audioContent, 'binary');
    console.log(`Audio content written to file: ${outputFile}`);

    // update RecordLog
    await db.updateRecordLog(data.session_seq, data.repeat_seq, outputFile,null)

    var ttsBuffer = await convertAuioToStremArray(outputFile);
    // Send request to play mp3 file on the web
    const PostData = {fileName : outputFile, ttsBuffer:ttsBuffer, tts_url:tts_url};
    client.emit('playTTS',PostData)
  }

});

//===================function==================

function save_stereo_mix(data){
  var path_parser =path.parse(data.fname)
  var full_path=path.join(audio_root_dir,'stereo_mix',path_parser.name+'.pcm')
  fs.appendFile(full_path, data.stereoBuffer, function (err) {
    if (err) throw err;
  });
}
async function convertAuioToStremArray(outputFile){
  var binary = fs.readFileSync(outputFile);

  var ttsStream = binary.slice(44,)
  var arr =  Array.prototype.slice.call(ttsStream,0)
  var ttsBuffer=Buffer.from(arr)
  
  return ttsBuffer
}
function dateFormat(date) {
  // Create file name in date format
  let month = date.getMonth() + 1;
  let day = date.getDate();
  let hour = date.getHours();
  let minute = date.getMinutes();
  let second = date.getSeconds();

  month = month >= 10 ? month : '0' + month;
  day = day >= 10 ? day : '0' + day;
  hour = hour >= 10 ? hour : '0' + hour;
  minute = minute >= 10 ? minute : '0' + minute;
  second = second >= 10 ? second : '0' + second;

  // ex) 2021-07-05-12:51:39
  return date.getFullYear() + '_' + month + '_' + day + '_' + hour + '_' + minute + '_' + second;
}


// =========================== START SERVER ================================ //

https.listen(port,'192.168.0.247',function(){
  console.log('[Https] Server started on port:'+port);
})
