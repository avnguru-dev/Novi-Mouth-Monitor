let video;
let faceMesh;
let faces = [];

let mouthOpenTrackerTime = null;
const ALERT_TIMEOUT_DURATION = 3000;

let modelReady = false;
let classifier = null;
let modelTrained = false;

const classes = [
  "CLOSED",
  "TALKING",
  "YAWNING",
  "MOUTH OPEN",
  "OTHER"
];

const sequenceLength = 24;
const featureCount = 10;
const recordInterval = 60;

let samples = [];
let featureHistory = [];

let prediction = "WAITING";
let predictionConfidence = 0;

let currentState = -1;
let stateStartTime = 0;

let stateCounts = [0, 0, 0, 0, 0];
let stateTimes = [0, 0, 0, 0, 0];



let sessionStartTime = 0;
let activePage = "camera";
let statusDiv;

let notificationServiceWorker = null;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js")
    .then(function(registration) {
      console.log("Service Worker registered.");

      notificationServiceWorker = registration;
    })
    .catch(function(error) {
      console.error(
        "Service Worker registration failed:",
        error
      );
    });
}


function setup() {
  let canvas = createCanvas(640, 480);
  canvas.parent("canvasContainer");

  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  statusDiv = document.getElementById("status");

  setupTabs();
  setupCorrectionButtons();
  setupTrainingButtons();
  setupStats();

  sessionStartTime = millis();
  setStatus("Loading FaceMesh...");
  faceMesh = ml5.faceMesh(
    {
      maxFaces: 1,
      refineLandmarks: true,
      flipped: true
    },
    function() {
      modelReady = true;
      faceMesh.detectStart(
        video,
        function(results) {
          faces = results;
        }
      );
      setStatus("FaceMesh ready.");
    }
  );

}
function draw() {
  background(10);


  if (activePage === "camera") {
    drawCamera();
  }

  if (!modelReady) {
    if (activePage === "camera") {
      drawOverlay(
        "LOADING FACEMESH",
        color(255, 190, 50)
      );
    }

    updateStatsDisplay();
    return;
  }

  if (faces.length === 0) {
    prediction = "NO FACE";
    predictionConfidence = 0;

    setCurrentState(-1);

    if (activePage === "camera") {
      drawOverlay(
        "NO FACE DETECTED",
        color(255, 170, 0)
      );
    }

    updateCameraGuess();
    updateStatsDisplay();

    return;
  }

  let frame = getFeatureFrame(faces[0]);

  if (!frame) {
    return;
  }

  featureHistory.push(frame);

  if (
    featureHistory.length >
    sequenceLength
  ) {
    featureHistory.shift();
  }

  if (
    modelTrained &&
    featureHistory.length >= sequenceLength
  ) {
    predictModel();
  } else {
    ruleBasedGuess(frame);
  }

      if (prediction === "MOUTH OPEN") {

  if (!mouthOpenTrackerTime) {
    mouthOpenTrackerTime = Date.now();
  }

  if (
    Date.now() - mouthOpenTrackerTime >=
    ALERT_TIMEOUT_DURATION
  ) {

    if (
  notificationServiceWorker &&
  Notification.permission === "granted"
) {

  notificationServiceWorker.showNotification(
    "Posture Alert!",
    {
      body: "Your mouth has been open for too long.",
      requireInteraction: false,
      tag: "mouth-open-alert"
    }
  );

}


    }

    mouthOpenTrackerTime = null;
  }

} else {

  mouthOpenTrackerTime = null;

}




  if (activePage === "camera") {
    drawFacePoints(faces[0]);
    drawCameraInfo();
  }

  updateCameraGuess();
  updateStatsDisplay();
}


function drawCamera() {
  if (
    !video ||
    video.elt.readyState < 2
  ) {
    return;
  }

  push();

  translate(width, 0);
  scale(-1, 1);

  image(
    video,
    0,
    0,
    width,
    height
  );

  pop();
}



function getFeatureFrame(face) {
  if (
    !face.keypoints ||
    face.keypoints.length < 375
  ) {
    return null;
  }

  let p = face.keypoints;

  let nose = p[1];

  let topLip = p[13];
  let bottomLip = p[14];

  let leftMouth = p[61];
  let rightMouth = p[291];

  let leftEyeTop = p[159];
  let leftEyeBottom = p[145];

  let rightEyeTop = p[386];
  let rightEyeBottom = p[374];

  let leftBrow = p[70];
  let rightBrow = p[300];

  let faceLeft = p[234];
  let faceRight = p[454];

  let faceTop = p[10];
  let faceBottom = p[152];

  let faceWidth = dist(
    faceLeft.x,
    faceLeft.y,
    faceRight.x,
    faceRight.y
  );

  let faceHeight = dist(
    faceTop.x,
    faceTop.y,
    faceBottom.x,
    faceBottom.y
  );

  let mouthWidth = dist(
    leftMouth.x,
    leftMouth.y,
    rightMouth.x,
    rightMouth.y
  );

  if (
    faceWidth <= 1 ||
    faceHeight <= 1 ||
    mouthWidth <= 1
  ) {
    return null;
  }

  let lipDistance = dist(
    topLip.x,
    topLip.y,
    bottomLip.x,
    bottomLip.y
  );

  let mouthGap =
    lipDistance / faceHeight;

  let normalizedWidth =
    mouthWidth / faceWidth;

  let mouthRatio =
    lipDistance / mouthWidth;

  let leftEye =
    dist(
      leftEyeTop.x,
      leftEyeTop.y,
      leftEyeBottom.x,
      leftEyeBottom.y
    ) / faceHeight;

  let rightEye =
    dist(
      rightEyeTop.x,
      rightEyeTop.y,
      rightEyeBottom.x,
      rightEyeBottom.y
    ) / faceHeight;

  let mouthX =
    (
      (
        leftMouth.x +
        rightMouth.x
      ) / 2 -
      nose.x
    ) / faceWidth;

  let mouthY =
    (
      (
        leftMouth.y +
        rightMouth.y
      ) / 2 -
      nose.y
    ) / faceHeight;

  let browWidth =
    dist(
      leftBrow.x,
      leftBrow.y,
      rightBrow.x,
      rightBrow.y
    ) / faceWidth;

  let noseX =
    (
      nose.x -
      faceLeft.x
    ) / faceWidth;

  let noseY =
    (
      nose.y -
      faceTop.y
    ) / faceHeight;

  return [
    mouthGap,
    normalizedWidth,
    mouthRatio,
    leftEye,
    rightEye,
    mouthX,
    mouthY,
    browWidth,
    noseX,
    noseY
  ];
}

function ruleBasedGuess(frame) {
  let mouthRatio = frame[2];
  let eyeLeft = frame[3];
  let eyeRight = frame[4];

  let averageEye =
    (
      eyeLeft +
      eyeRight
    ) / 2;

  if (mouthRatio > 0.45) {
    prediction = "MOUTH OPEN";
    predictionConfidence = 0.8;
    setCurrentState(3);
    return;
  }

  if (
    mouthRatio > 0.25 &&
    averageEye < 0.045
  ) {
    prediction = "YAWNING";
    predictionConfidence = 0.65;
    setCurrentState(2);
    return;
  }

  prediction = "CLOSED";
  predictionConfidence = 0.7;
  setCurrentState(0);
}

function predictModel() {
  if (
    !classifier ||
    featureHistory.length <
    sequenceLength
  ) {
    return;
  }

  let flattened = [];

  for (
    let frame of featureHistory
  ) {
    for (
      let value of frame
    ) {
      flattened.push(value);
    }
  }

  tf.tidy(function() {
    let input =
      tf.tensor2d(
        [flattened],
        [
          1,
          sequenceLength *
          featureCount
        ]
      );

    let output =
      classifier.predict(input);

    let values =
      output.dataSync();

    let best = 0;

    for (
      let i = 1;
      i < values.length;
      i++
    ) {
      if (
        values[i] >
        values[best]
      ) {
        best = i;
      }
    }

    prediction =
      classes[best];

    predictionConfidence =
      values[best];

    if (
      predictionConfidence <
      0.55
    ) {
      setCurrentState(4);
    } else {
      setCurrentState(best);
    }
  });
}

function correctCurrentBehavior(index) {
  if (
    featureHistory.length <
    sequenceLength
  ) {
    setStatus(
      "Wait until the face sequence fills."
    );

    return;
  }

  let sequence = [];

  for (
    let i = 0;
    i < featureHistory.length;
    i++
  ) {
    let frame =
      featureHistory[i];

    sequence.push(
      Array.from(frame)
    );
  }

  samples.push({
    x: sequence,
    y: index
  });

  updateTrainingCounts();

  setStatus(
    "Added example: " +
    classes[index]
  );
}

function setupCorrectionButtons() {
  document.getElementById(
    "correctClosed"
  ).onclick =
    function() {
      correctCurrentBehavior(0);
    };

  document.getElementById(
    "correctTalking"
  ).onclick =
    function() {
      correctCurrentBehavior(1);
    };

  document.getElementById(
    "correctYawning"
  ).onclick =
    function() {
      correctCurrentBehavior(2);
    };

  document.getElementById(
    "correctOpen"
  ).onclick =
    function() {
      correctCurrentBehavior(3);
    };

  document.getElementById(
    "correctOther"
  ).onclick =
    function() {
      correctCurrentBehavior(4);
    };
}

function trainModel() {
  if (
    samples.length < 10
  ) {
    setStatus(
      "Collect at least 10 examples first."
    );

    return;
  }

  let xData = [];
  let yData = [];

  for (
    let sample of samples
  ) {
    let row = [];

    for (
      let frame of sample.x
    ) {
      for (
        let value of frame
      ) {
        row.push(
          Number(value)
        );
      }
    }

    if (
      row.length !==
      sequenceLength *
      featureCount
    ) {
      continue;
    }

    xData.push(row);

    let label =
      new Array(5).fill(0);

    label[sample.y] = 1;

    yData.push(label);
  }

  if (
    xData.length < 10
  ) {
    setStatus(
      "Not enough valid samples."
    );

    return;
  }

  setStatus("Training...");

  let xs =
    tf.tensor2d(xData);

  let ys =
    tf.tensor2d(yData);

  if (classifier) {
    classifier.dispose();
  }

  classifier =
    tf.sequential();

  classifier.add(
    tf.layers.dense({
      inputShape: [
        sequenceLength *
        featureCount
      ],
      units: 128,
      activation: "relu"
    })
  );

  classifier.add(
    tf.layers.dropout({
      rate: 0.25
    })
  );

  classifier.add(
    tf.layers.dense({
      units: 64,
      activation: "relu"
    })
  );

  classifier.add(
    tf.layers.dense({
      units: 5,
      activation: "softmax"
    })
  );

  classifier.compile({
    optimizer:
      tf.train.adam(0.001),
    loss:
      "categoricalCrossentropy",
    metrics: ["accuracy"]
  });

  classifier.fit(
    xs,
    ys,
    {
      epochs: 40,
      batchSize: Math.min(
        16,
        xData.length
      ),
      shuffle: true,

      callbacks: {
        onEpochEnd:
          async function(
            epoch,
            logs
          ) {
            let accuracy =
              logs.accuracy ??
              logs.acc ??
              0;

            setStatus(
              "Training " +
              (
                epoch + 1
              ) +
              "/40  " +
              (
                accuracy * 100
              ).toFixed(1) +
              "%"
            );

            await tf.nextFrame();
          },

        onTrainEnd:
          function() {
            xs.dispose();
            ys.dispose();

            modelTrained = true;

            document.getElementById(
              "saveModelBtn"
            ).disabled = false;

            document.getElementById(
              "modelStatus"
            ).innerText =
              "Trained";

            setStatus(
              "Model trained."
            );
          }
      }
    }
  );
}

function saveModel() {
  if (
    !classifier ||
    !modelTrained
  ) {
    return;
  }

  classifier.save(
    "downloads://face-behavior-model"
  );

  setStatus(
    "Model downloaded."
  );
}

function loadModel() {
  let input =
    document.createElement(
      "input"
    );

  input.type = "file";
  input.accept = ".json";

  input.onchange =
    async function(event) {
      let file =
        event.target.files[0];

      if (!file) {
        return;
      }

      try {
        classifier =
          await tf.loadLayersModel(
            tf.io.browserFiles(
              [file]
            )
          );

        modelTrained = true;

        document.getElementById(
          "saveModelBtn"
        ).disabled = false;

        document.getElementById(
          "modelStatus"
        ).innerText =
          "Loaded";

        setStatus(
          "Model loaded."
        );
      } catch (error) {
        console.error(error);

        setStatus(
          "Model load failed."
        );
      }
    };

  input.click();
}

function saveSamples() {
  let data = JSON.stringify(
    samples
  );

  let blob =
    new Blob(
      [data],
      {
        type:
          "application/json"
      }
    );

  let url =
    URL.createObjectURL(
      blob
    );

  let link =
    document.createElement(
      "a"
    );

  link.href = url;
  link.download =
    "face-behavior-samples.json";

  document.body.appendChild(
    link
  );

  link.click();

  document.body.removeChild(
    link
  );

  URL.revokeObjectURL(
    url
  );

  setStatus(
    "Samples downloaded."
  );
}

function loadSamples() {
  let input =
    document.createElement(
      "input"
    );

  input.type = "file";
  input.accept = ".json";

  input.onchange =
    function(event) {
      let file =
        event.target.files[0];

      if (!file) {
        return;
      }

      let reader =
        new FileReader();

      reader.onload =
        function() {
          try {
            let loaded =
              JSON.parse(
                reader.result
              );

            if (
              !Array.isArray(
                loaded
              )
            ) {
              throw new Error(
                "Invalid sample file"
              );
            }

            let valid = [];

            for (
              let sample of loaded
            ) {
              if (
                !sample ||
                !Array.isArray(
                  sample.x
                )
              ) {
                continue;
              }

              if (
                sample.x.length !==
                sequenceLength
              ) {
                continue;
              }

              if (
                sample.y < 0 ||
                sample.y >= 5
              ) {
                continue;
              }

              let good =
                true;

              for (
                let frame of sample.x
              ) {
                if (
                  !Array.isArray(
                    frame
                  ) ||
                  frame.length !==
                  featureCount
                ) {
                  good = false;
                  break;
                }
              }

              if (good) {
                valid.push(
                  sample
                );
              }
            }

            samples = valid;

            updateTrainingCounts();

            setStatus(
              "Loaded " +
              samples.length +
              " samples."
            );
          } catch (error) {
            console.error(error);

            setStatus(
              "Invalid sample file."
            );
          }
        };

      reader.readAsText(
        file
      );
    };

  input.click();
}

function clearSamples() {
  if (
    confirm(
      "Clear all training samples?"
    )
  ) {
    samples = [];

    updateTrainingCounts();

    setStatus(
      "Samples cleared."
    );
  }
}

function updateTrainingCounts() {
  let counts = [
    0,
    0,
    0,
    0,
    0
  ];

  for (
    let sample of samples
  ) {
    if (
      sample.y >= 0 &&
      sample.y < 5
    ) {
      counts[
        sample.y
      ]++;
    }
  }

  document.getElementById(
    "closedCount"
  ).innerText =
    counts[0];

  document.getElementById(
    "talkingCount"
  ).innerText =
    counts[1];

  document.getElementById(
    "yawnCount"
  ).innerText =
    counts[2];

  document.getElementById(
    "openCount"
  ).innerText =
    counts[3];

  document.getElementById(
    "otherCount"
  ).innerText =
    counts[4];

  document.getElementById(
    "trainBtn"
  ).disabled =
    samples.length < 10;
}

function setCurrentState(state) {
  let now = millis();

  if (
    state === currentState
  ) {
    return;
  }

  if (
    currentState >= 0
  ) {
    stateTimes[
      currentState
    ] +=
      now -
      stateStartTime;
  }

  currentState = state;
  stateStartTime = now;

  if (
    state >= 0
  ) {
    stateCounts[state]++;
  }
}

function updateCameraGuess() {
  let element =
    document.getElementById(
      "cameraGuess"
    );

  if (!element) {
    return;
  }

  element.innerText =
    "Current guess: " +
    prediction +
    " (" +
    (
      predictionConfidence *
      100
    ).toFixed(0) +
    "%)";
}

function updateStatsDisplay() {
  let now = millis();

  let times =
    stateTimes.slice();

  if (
    currentState >= 0
  ) {
    times[
      currentState
    ] +=
      now -
      stateStartTime;
  }

  document.getElementById(
    "currentState"
  ).innerText =
    currentState >= 0
      ? classes[currentState]
      : "Waiting";

  document.getElementById(
    "confidence"
  ).innerText =
    (
      predictionConfidence *
      100
    ).toFixed(0) + "%";

  document.getElementById(
    "closedStats"
  ).innerText =
    stateCounts[0];

  document.getElementById(
    "talkingStats"
  ).innerText =
    stateCounts[1];

  document.getElementById(
    "yawnStats"
  ).innerText =
    stateCounts[2];

  document.getElementById(
    "openStats"
  ).innerText =
    stateCounts[3];

  document.getElementById(
    "otherStats"
  ).innerText =
    stateCounts[4];

  document.getElementById(
    "closedTime"
  ).innerText =
    formatSeconds(times[0]);

  document.getElementById(
    "talkingTime"
  ).innerText =
    formatSeconds(times[1]);

  document.getElementById(
    "yawnTime"
  ).innerText =
    formatSeconds(times[2]);

  document.getElementById(
    "openTime"
  ).innerText =
    formatSeconds(times[3]);

  document.getElementById(
    "otherTime"
  ).innerText =
    formatSeconds(times[4]);

  document.getElementById(
    "sessionTime"
  ).innerText =
    formatClock(
      (
        now -
        sessionStartTime
      ) / 1000
    );
}

function resetStats() {
  stateCounts = [
    0,
    0,
    0,
    0,
    0
  ];

  stateTimes = [
    0,
    0,
    0,
    0,
    0
  ];

  currentState = -1;

  stateStartTime =
    millis();

  setStatus(
    "Stats reset."
  );
}

function drawFacePoints(face) {
  let indices = [
    13,
    14,
    61,
    291,
    159,
    145,
    386,
    374
  ];

  fill(
    0,
    200,
    255
  );

  noStroke();

  for (
    let index of indices
  ) {
    let p =
      face.keypoints[
        index
      ];

    ellipse(
      width - p.x,
      p.y,
      7,
      7
    );
  }
}

function drawCameraInfo() {
  fill(
    0,
    0,
    0,
    190
  );

  noStroke();

  rect(
    10,
    10,
    440,
    75,
    8
  );

  fill(255);

  textAlign(
    LEFT,
    CENTER
  );

  textSize(20);

  text(
    prediction,
    25,
    35
  );

  fill(
    predictionConfidence >
    0.7
      ? color(
          70,
          255,
          120
        )
      : color(
          255,
          190,
          60
        )
  );

  textSize(15);

  text(
    "Confidence: " +
    (
      predictionConfidence *
      100
    ).toFixed(0) +
    "%",
    25,
    61
  );

  if (!modelTrained) {
    fill(
      255,
      190,
      60
    );

    textSize(12);

    text(
      "EXPERIMENTAL RULE-BASED GUESS",
      250,
      61
    );
  }
}

function drawOverlay(
  textValue,
  col
) {
  fill(
    0,
    0,
    0,
    190
  );

  noStroke();

  rect(
    10,
    10,
    440,
    55,
    8
  );

  fill(col);

  textAlign(
    LEFT,
    CENTER
  );

  textSize(18);

  text(
    textValue,
    25,
    38
  );
}

function setupTabs() {
  document.getElementById(
    "cameraTab"
  ).onclick =
    function() {
      showPage("camera");
    };

  document.getElementById(
    "trainingTab"
  ).onclick =
    function() {
      showPage("training");
    };

  document.getElementById(
    "statsTab"
  ).onclick =
    function() {
      showPage("stats");
    };
}

function showPage(page) {
  activePage = page;

  document.getElementById(
    "cameraPage"
  ).style.display =
    page === "camera"
      ? "block"
      : "none";

  document.getElementById(
    "trainingPage"
  ).style.display =
    page === "training"
      ? "block"
      : "none";

  document.getElementById(
    "statsPage"
  ).style.display =
    page === "stats"
      ? "block"
      : "none";

  document.getElementById(
    "cameraTab"
  ).classList.toggle(
    "active",
    page === "camera"
  );

  document.getElementById(
    "trainingTab"
  ).classList.toggle(
    "active",
    page === "training"
  );

  document.getElementById(
    "statsTab"
  ).classList.toggle(
    "active",
    page === "stats"
  );
}

function setupTrainingButtons() {
  document.getElementById(
    "trainBtn"
  ).onclick =
    trainModel;

  document.getElementById(
    "saveModelBtn"
  ).onclick =
    saveModel;

  document.getElementById(
    "loadModelBtn"
  ).onclick =
    loadModel;

  document.getElementById(
    "saveSamplesBtn"
  ).onclick =
    saveSamples;

  document.getElementById(
    "loadSamplesBtn"
  ).onclick =
    loadSamples;

  document.getElementById(
    "clearSamplesBtn"
  ).onclick =
    clearSamples;
}

function setupStats() {
  document.getElementById(
    "resetStatsBtn"
  ).onclick =
    resetStats;
}

function setStatus(message) {
  if (statusDiv) {
    statusDiv.innerText =
      message;
  }
}

function formatSeconds(
  milliseconds
) {
  return (
    milliseconds / 1000
  ).toFixed(1) + "s";
}

function formatClock(seconds) {
  let minutes =
    Math.floor(
      seconds / 60
    );

  let remaining =
    Math.floor(
      seconds % 60
    );

  return (
    minutes +
    ":" +
    String(
      remaining
    ).padStart(2, "0")
  );
}
