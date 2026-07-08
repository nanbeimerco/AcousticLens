// AcousticLens - Headphone Peak & Dip Detector Logic

// State management
let state = {
    screen: 'intro', // intro, config, test, results
    freqMin: 1000,
    freqMax: 12000,
    numPoints: 9,
    points: [], // Array of { freq, level, origin } sorted by freq
    comparisons: [], // Array of comparison tasks
    currentCompIndex: 0,
    volume: 0.08, // 8% default
    isAutoPlaying: false,
    autoPlayTimer: null,
    activeTone: null, // 'A' or 'B'
    refinementRound: 0
};

// Web Audio Context & Nodes
let audioCtx = null;
let oscillator = null;
let gainNode = null;

// Initialize Audio Context on user gesture
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Stop current oscillator with a quick fade-out to prevent pops
function stopOscillator(callback) {
    if (oscillator && gainNode) {
        const osc = oscillator;
        const gain = gainNode;
        const now = audioCtx.currentTime;
        
        // Quick ramp down
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0.0001, now + 0.04);
        
        oscillator = null;
        gainNode = null;
        
        setTimeout(() => {
            try {
                osc.stop();
                osc.disconnect();
                gain.disconnect();
            } catch (e) {
                // Ignore if already stopped
            }
            if (callback) callback();
        }, 50);
    } else {
        if (callback) callback();
    }
}

// Play pure sine wave at specified frequency
function playTone(freq) {
    initAudio();
    
    // If already running, fade out, change freq, and fade in
    if (oscillator && gainNode) {
        const now = audioCtx.currentTime;
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.04);
        
        setTimeout(() => {
            if (!oscillator || !gainNode) return;
            oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(state.volume, audioCtx.currentTime + 0.04);
        }, 50);
    } else {
        // Start new oscillator
        oscillator = audioCtx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
        
        gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.start();
        gainNode.gain.linearRampToValueAtTime(state.volume, audioCtx.currentTime + 0.04);
    }
}

// Stop all audio playback
function stopAllPlayback() {
    state.isAutoPlaying = false;
    if (state.autoPlayTimer) {
        clearInterval(state.autoPlayTimer);
        state.autoPlayTimer = null;
    }
    state.activeTone = null;
    updateToneCardUI();
    stopOscillator();
    
    const btnToggle = document.getElementById('btn-toggle-play');
    if (btnToggle) btnToggle.textContent = '🔁 A/Bを交互に自動切替 (2秒ごと)';
}

// Toggle play A and B automatically
function startAutoToggle(freqA, freqB) {
    stopAllPlayback();
    state.isAutoPlaying = true;
    
    state.activeTone = 'A';
    playTone(freqA);
    updateToneCardUI();
    
    const btnToggle = document.getElementById('btn-toggle-play');
    btnToggle.textContent = '⏸ 自動切替を停止';
    
    state.autoPlayTimer = setInterval(() => {
        if (!state.isAutoPlaying) return;
        
        if (state.activeTone === 'A') {
            state.activeTone = 'B';
            playTone(freqB);
        } else {
            state.activeTone = 'A';
            playTone(freqA);
        }
        updateToneCardUI();
    }, 1800); // 1.8 seconds is comfortable for comparison
}

// Update tone card visual playing states
function updateToneCardUI() {
    const cardA = document.getElementById('tone-card-a');
    const cardB = document.getElementById('tone-card-b');
    const btnA = document.getElementById('btn-play-a');
    const btnB = document.getElementById('btn-play-b');
    
    if (state.activeTone === 'A') {
        cardA.classList.add('playing-tone');
        cardB.classList.remove('playing-tone');
        btnA.textContent = '🔊 再生中';
        btnB.textContent = '▶ 再生';
    } else if (state.activeTone === 'B') {
        cardA.classList.remove('playing-tone');
        cardB.classList.add('playing-tone');
        btnA.textContent = '▶ 再生';
        btnB.textContent = '🔊 再生中';
    } else {
        cardA.classList.remove('playing-tone');
        cardB.classList.remove('playing-tone');
        btnA.textContent = '▶ 再生';
        btnB.textContent = '▶ 再生';
    }
}

// Setup Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    setupScreenNavigation();
    setupVolumeControls();
    setupTestFlow();
    setupResultsSweep();
    setupKeyboardShortcuts();
});

// Setup screens transition
function setupScreenNavigation() {
    const screenIntro = document.getElementById('screen-intro');
    const screenConfig = document.getElementById('screen-config');
    const screenTest = document.getElementById('screen-test');
    const screenResults = document.getElementById('screen-results');
    
    const chkSafety = document.getElementById('chk-safety');
    const btnGoConfig = document.getElementById('btn-go-to-config');
    const btnBackIntro = document.getElementById('btn-back-to-intro');
    const btnStartTest = document.getElementById('btn-start-test');
    const btnRestart = document.getElementById('btn-restart');
    
    // Safety check agreement
    chkSafety.addEventListener('change', () => {
        btnGoConfig.disabled = !chkSafety.checked;
    });
    
    btnGoConfig.addEventListener('click', () => {
        stopAllPlayback();
        showScreen('config');
    });
    
    btnBackIntro.addEventListener('click', () => {
        stopAllPlayback();
        showScreen('intro');
    });
    
    // Test points slider listener
    const inputPoints = document.getElementById('input-test-points');
    const pointsVal = document.getElementById('test-points-val');
    inputPoints.addEventListener('input', (e) => {
        pointsVal.textContent = `${e.target.value} ポイント`;
    });
    
    btnStartTest.addEventListener('click', () => {
        initTestParameters();
        showScreen('test');
        startComparison();
    });
    
    btnRestart.addEventListener('click', () => {
        stopAllPlayback();
        state.refinementRound = 0;
        showScreen('config');
    });
}

function showScreen(screenId) {
    document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
    document.getElementById(`screen-${screenId}`).classList.add('active');
    state.screen = screenId;
}

// Volume Controls Setup
function setupVolumeControls() {
    const inputInitVol = document.getElementById('input-init-volume');
    const initVolVal = document.getElementById('init-volume-val');
    const inputTestVol = document.getElementById('input-test-volume');
    const testVolVal = document.getElementById('test-volume-val');
    const btnTestSound = document.getElementById('btn-test-sound');
    
    function handleVolChange(val) {
        state.volume = val / 100;
        initVolVal.textContent = `${val}%`;
        testVolVal.textContent = `${val}%`;
        inputInitVol.value = val;
        inputTestVol.value = val;
        
        // Update volume on gain node if playing
        if (gainNode) {
            gainNode.gain.setValueAtTime(state.volume, audioCtx.currentTime);
        }
    }
    
    inputInitVol.addEventListener('input', (e) => handleVolChange(e.target.value));
    inputTestVol.addEventListener('input', (e) => handleVolChange(e.target.value));
    
    // Play test sound for volume calibration
    let testPlaying = false;
    btnTestSound.addEventListener('click', () => {
        if (!testPlaying) {
            initAudio();
            playTone(1000);
            btnTestSound.textContent = '⏹ テスト音を停止';
            btnTestSound.classList.remove('btn-secondary');
            btnTestSound.classList.add('btn-danger');
            testPlaying = true;
        } else {
            stopOscillator();
            btnTestSound.textContent = '🔊 テスト音を再生 (1000Hz)';
            btnTestSound.classList.remove('btn-danger');
            btnTestSound.classList.add('btn-secondary');
            testPlaying = false;
        }
    });
}

// Test settings initialization
function initTestParameters() {
    state.freqMin = parseInt(document.getElementById('input-freq-min').value) || 1000;
    state.freqMax = parseInt(document.getElementById('input-freq-max').value) || 12000;
    state.numPoints = parseInt(document.getElementById('input-test-points').value) || 9;
    state.refinementRound = 0;
    
    // Generate initial logarithmically spaced points
    state.points = [];
    const logMin = Math.log10(state.freqMin);
    const logMax = Math.log10(state.freqMax);
    for (let i = 0; i < state.numPoints; i++) {
        const freq = Math.round(Math.pow(10, logMin + (i / (state.numPoints - 1)) * (logMax - logMin)));
        state.points.push({ freq, level: 0, origin: 'coarse' });
    }
    
    // Generate initial comparison tasks (adjacent points)
    state.comparisons = [];
    for (let i = 0; i < state.points.length - 1; i++) {
        state.comparisons.push({
            type: 'coarse',
            indexA: i,
            indexB: i + 1,
            freqA: state.points[i].freq,
            freqB: state.points[i + 1].freq,
            score: null
        });
    }
    state.currentCompIndex = 0;
}

// Start current comparison test
function startComparison() {
    stopAllPlayback();
    
    const comp = state.comparisons[state.currentCompIndex];
    
    // Update progress UI
    const progressText = document.getElementById('test-progress-text');
    const progressBar = document.getElementById('test-progress-bar');
    const pct = ((state.currentCompIndex) / state.comparisons.length) * 100;
    
    progressText.textContent = `比較: ${state.currentCompIndex + 1} / ${state.comparisons.length} (スキャン: ${state.refinementRound === 0 ? '初期' : '詳細' + state.refinementRound})`;
    progressBar.style.width = `${Math.max(5, pct)}%`;
    
    // Set frequencies
    document.getElementById('freq-val-a').textContent = `${comp.freqA.toLocaleString()} Hz`;
    document.getElementById('freq-val-b').textContent = `${comp.freqB.toLocaleString()} Hz`;
    
    // Toggle prev button state
    document.getElementById('btn-prev-test').disabled = state.currentCompIndex === 0;
    
    // Set active rate rating button if user already responded
    document.querySelectorAll('.btn-rate').forEach(btn => {
        const score = parseInt(btn.getAttribute('data-score'));
        if (comp.score !== null && comp.score === score) {
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-secondary');
        } else {
            btn.classList.remove('btn-primary');
            // reset to original styling
        }
    });
}

function setupTestFlow() {
    const btnPlayA = document.getElementById('btn-play-a');
    const btnPlayB = document.getElementById('btn-play-b');
    const btnTogglePlay = document.getElementById('btn-toggle-play');
    const btnStopAll = document.getElementById('btn-stop-all');
    const btnPrevTest = document.getElementById('btn-prev-test');
    
    btnPlayA.addEventListener('click', () => {
        stopAllPlayback();
        state.activeTone = 'A';
        playTone(state.comparisons[state.currentCompIndex].freqA);
        updateToneCardUI();
    });
    
    btnPlayB.addEventListener('click', () => {
        stopAllPlayback();
        state.activeTone = 'B';
        playTone(state.comparisons[state.currentCompIndex].freqB);
        updateToneCardUI();
    });
    
    btnTogglePlay.addEventListener('click', () => {
        const comp = state.comparisons[state.currentCompIndex];
        if (state.isAutoPlaying) {
            stopAllPlayback();
        } else {
            startAutoToggle(comp.freqA, comp.freqB);
        }
    });
    
    btnStopAll.addEventListener('click', () => {
        stopAllPlayback();
    });
    
    btnPrevTest.addEventListener('click', () => {
        if (state.currentCompIndex > 0) {
            state.currentCompIndex--;
            startComparison();
        }
    });
    
    // Rating buttons
    document.querySelectorAll('.btn-rate').forEach(btn => {
        btn.addEventListener('click', () => {
            const score = parseInt(btn.getAttribute('data-score'));
            submitScore(score);
        });
    });
}

function submitScore(score) {
    state.comparisons[state.currentCompIndex].score = score;
    
    // Brief highlight animation or delay before moving
    setTimeout(() => {
        if (state.currentCompIndex < state.comparisons.length - 1) {
            state.currentCompIndex++;
            startComparison();
        } else {
            // Finish all comparisons
            stopAllPlayback();
            calculateCurveAndShowResults();
        }
    }, 200);
}

// Calculate the relative loudness curve
function calculateCurveAndShowResults() {
    if (state.refinementRound === 0) {
        // Coarse calculation
        state.points[0].level = 0;
        for (let i = 0; i < state.comparisons.length; i++) {
            const comp = state.comparisons[i];
            // L(B) = L(A) - score -> L(i+1) = L(i) - score
            state.points[i + 1].level = state.points[i].level - comp.score;
        }
    } else {
        // Refinement integration
        // Merge comparison scores into targets
        state.comparisons.forEach(comp => {
            if (comp.type === 'refinement') {
                const targetIdx = state.points.findIndex(p => p.freq === comp.targetFreq);
                if (targetIdx !== -1) {
                    if (comp.role === 'left') {
                        // score = L(target) - L(ref) -> L(target) = L(ref) + score
                        state.points[targetIdx].level = comp.refLevel + comp.score;
                    } else if (comp.role === 'right') {
                        // score = L(ref) - L(target) -> L(target) = L(ref) - score
                        state.points[targetIdx].level = comp.refLevel - comp.score;
                    }
                }
            }
        });
    }
    
    // Sort points by frequency to ensure graph displays correctly
    state.points.sort((a, b) => a.freq - b.freq);
    
    // Detect Peaks & Dips and Render Results
    showScreen('results');
    analyzePeaksAndDips();
    renderResultsChart();
    initSweepVerification();
}

// Peak & Dip Extrema Analysis (Generalized for plateaus/flat regions)
function analyzePeaksAndDips() {
    const peaksList = document.getElementById('peaks-list');
    const dipsList = document.getElementById('dips-list');
    
    peaksList.innerHTML = '';
    dipsList.innerHTML = '';
    
    const peaks = [];
    const dips = [];
    const n = state.points.length;
    
    // Find contiguous plateaus of equal levels (flat regions)
    let startIdx = 0;
    while (startIdx < n) {
        let endIdx = startIdx;
        while (endIdx + 1 < n && state.points[endIdx + 1].level === state.points[startIdx].level) {
            endIdx++;
        }
        
        // Bounded on both sides (skipping boundary plateaus)
        if (startIdx > 0 && endIdx < n - 1) {
            const levelVal = state.points[startIdx].level;
            const leftVal = state.points[startIdx - 1].level;
            const rightVal = state.points[endIdx + 1].level;
            
            // Peak plateau: strictly higher than left and right neighbors
            if (levelVal > leftVal && levelVal > rightVal) {
                const prominence = Math.min(levelVal - leftVal, levelVal - rightVal);
                const leftNeighborFreq = state.points[startIdx - 1].freq;
                const rightNeighborFreq = state.points[endIdx + 1].freq;
                const certainty = calculateCertainty(leftNeighborFreq, rightNeighborFreq);
                
                // Representative freq is geometric mean of start and end of plateau
                const repFreq = Math.round(Math.sqrt(state.points[startIdx].freq * state.points[endIdx].freq));
                
                peaks.push({
                    freq: repFreq,
                    freqStart: state.points[startIdx].freq,
                    freqEnd: state.points[endIdx].freq,
                    freqLeftNeighbor: leftNeighborFreq,
                    freqRightNeighbor: rightNeighborFreq,
                    level: levelVal,
                    prominence,
                    certainty,
                    isPlateau: startIdx < endIdx
                });
            }
            
            // Dip plateau: strictly lower than left and right neighbors
            if (levelVal < leftVal && levelVal < rightVal) {
                const prominence = Math.min(leftVal - levelVal, rightVal - levelVal);
                const leftNeighborFreq = state.points[startIdx - 1].freq;
                const rightNeighborFreq = state.points[endIdx + 1].freq;
                const certainty = calculateCertainty(leftNeighborFreq, rightNeighborFreq);
                
                const repFreq = Math.round(Math.sqrt(state.points[startIdx].freq * state.points[endIdx].freq));
                
                dips.push({
                    freq: repFreq,
                    freqStart: state.points[startIdx].freq,
                    freqEnd: state.points[endIdx].freq,
                    freqLeftNeighbor: leftNeighborFreq,
                    freqRightNeighbor: rightNeighborFreq,
                    level: levelVal,
                    prominence,
                    certainty,
                    isPlateau: startIdx < endIdx
                });
            }
        }
        
        startIdx = endIdx + 1;
    }
    
    // Render Peaks list
    if (peaks.length === 0) {
        peaksList.innerHTML = '<div class="extrema-placeholder">ピークは検出されませんでした。測定範囲を変更するか、詳細測定に進んでください。</div>';
    } else {
        peaks.forEach(p => {
            const badgeClass = p.prominence >= 3 ? 'badge-strong' : (p.prominence >= 1.5 ? 'badge-moderate' : 'badge-subtle');
            const badgeText = p.prominence >= 3 ? '強' : (p.prominence >= 1.5 ? '中' : '弱');
            
            const item = document.createElement('div');
            item.className = 'extrema-item peak-item';
            
            const freqDisplay = p.isPlateau 
                ? `${p.freq.toLocaleString()} Hz <span class="range-span">(範囲: ${p.freqStart.toLocaleString()}〜${p.freqEnd.toLocaleString()} Hz)</span>`
                : `${p.freq.toLocaleString()} Hz`;
                
            item.innerHTML = `
                <div class="extrema-top">
                    <span class="extrema-freq">${freqDisplay}</span>
                    <span class="badge ${badgeClass}">${badgeText}ピーク</span>
                </div>
                <div class="certainty-wrapper">
                    <div class="certainty-label-container">
                        <span>位置の確信度:</span>
                        <strong>${p.certainty}%</strong>
                    </div>
                    <div class="certainty-bar-outer">
                        <div class="certainty-bar-inner" style="width: ${p.certainty}%;"></div>
                    </div>
                </div>
            `;
            peaksList.appendChild(item);
        });
    }
    
    // Render Dips list
    if (dips.length === 0) {
        dipsList.innerHTML = '<div class="extrema-placeholder">ディップは検出されませんでした。</div>';
    } else {
        dips.forEach(d => {
            const badgeClass = d.prominence >= 3 ? 'badge-strong' : (d.prominence >= 1.5 ? 'badge-moderate' : 'badge-subtle');
            const badgeText = d.prominence >= 3 ? '強' : (d.prominence >= 1.5 ? '中' : '弱');
            
            const item = document.createElement('div');
            item.className = 'extrema-item dip-item';
            
            const freqDisplay = d.isPlateau 
                ? `${d.freq.toLocaleString()} Hz <span class="range-span">(範囲: ${d.freqStart.toLocaleString()}〜${d.freqEnd.toLocaleString()} Hz)</span>`
                : `${d.freq.toLocaleString()} Hz`;
                
            item.innerHTML = `
                <div class="extrema-top">
                    <span class="extrema-freq">${freqDisplay}</span>
                    <span class="badge ${badgeClass}">${badgeText}ディップ</span>
                </div>
                <div class="certainty-wrapper">
                    <div class="certainty-label-container">
                        <span>位置の確信度:</span>
                        <strong>${d.certainty}%</strong>
                    </div>
                    <div class="certainty-bar-outer">
                        <div class="certainty-bar-inner" style="width: ${d.certainty}%;"></div>
                    </div>
                </div>
            `;
            dipsList.appendChild(item);
        });
    }
    
    // Save detected extrema details for refinement setup
    state.detectedExtrema = [...peaks, ...dips];
    
    // Refinement button is always enabled, texts updated dynamically
    const btnRefine = document.getElementById('btn-refine');
    const refineDescText = document.querySelector('.action-details p');
    const refineTitleText = document.querySelector('.action-details h4');
    
    btnRefine.disabled = false;
    
    if (state.detectedExtrema.length === 0) {
        if (refineTitleText) refineTitleText.textContent = '🔍 周波数全体の解像度を上げて測定する';
        if (refineDescText) refineDescText.textContent = '明瞭なピーク・ディップが検出されなかったため、測定点の間をすべて分割し、全体をより詳細に再スキャンします。';
        btnRefine.innerHTML = '<span class="btn-icon">⚡</span>全体を詳細測定';
    } else {
        if (refineTitleText) refineTitleText.textContent = '🔍 ピークやディップをさらに詳しく絞り込む';
        if (refineDescText) refineDescText.textContent = '検出されたピークとディップの周辺に新しい測定点を追加し、さらに細かく比較テストを行います（確信度・精度が上がります）。';
        btnRefine.innerHTML = '<span class="btn-icon">⚡</span>詳細測定（リファイン）を開始';
    }
}

// Certainty Calculation
// Based on logarithmic distance between adjacent surrounding points
function calculateCertainty(lowerFreq, upperFreq) {
    const semitones = 12 * Math.log2(upperFreq / lowerFreq);
    if (semitones <= 1) return 100;
    if (semitones >= 12) return 10;
    
    // Linear scale between 12 semitones (10%) and 1 semitone (100%)
    const pct = 100 - ((semitones - 1) / 11) * 90;
    return Math.round(Math.max(10, Math.min(100, pct)));
}

// Chart.js render logic
let resultsChart = null;
function renderResultsChart() {
    const ctx = document.getElementById('resultsChart').getContext('2d');
    const dataPoints = state.points.map(p => ({ x: p.freq, y: p.level }));
    
    if (resultsChart) {
        resultsChart.data.datasets[0].data = dataPoints;
        resultsChart.options.scales.x.min = state.freqMin;
        resultsChart.options.scales.x.max = state.freqMax;
        resultsChart.update();
        return;
    }
    
    resultsChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: '相対レベル',
                data: dataPoints,
                borderColor: '#76b900',
                backgroundColor: 'rgba(118, 185, 0, 0.02)',
                borderWidth: 2.5,
                pointBackgroundColor: '#76b900',
                pointBorderColor: '#000000',
                pointBorderWidth: 1.5,
                pointRadius: 5,
                pointHoverRadius: 7,
                fill: true,
                tension: 0.25
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#18181b',
                    titleColor: '#76b900',
                    bodyColor: '#cccccc',
                    borderColor: '#27272a',
                    borderWidth: 1,
                    callbacks: {
                        title: function(context) {
                            return `${context[0].parsed.x.toLocaleString()} Hz`;
                        },
                        label: function(context) {
                            return `相対音量: ${context.parsed.y > 0 ? '+' : ''}${context.parsed.y} dB相当`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'logarithmic',
                    min: state.freqMin,
                    max: state.freqMax,
                    grid: { color: '#18181b' },
                    ticks: {
                        color: '#a1a1aa',
                        font: { family: 'Atkinson Hyperlegible Next' },
                        callback: function(value) {
                            const val = Math.round(value);
                            if (val === state.freqMin || val === state.freqMax) {
                                return val >= 1000 ? `${(val / 1000).toFixed(1).replace('.0', '')}kHz` : `${val}Hz`;
                            }
                            if (val >= 1000) {
                                if (val % 1000 === 0) {
                                    return `${val / 1000}kHz`;
                                }
                            } else {
                                if (val % 100 === 0) {
                                    return `${val}Hz`;
                                }
                            }
                            return null;
                        }
                    }
                },
                y: {
                    grid: { color: '#18181b' },
                    ticks: { 
                        color: '#a1a1aa',
                        font: { family: 'Atkinson Hyperlegible Next' }
                    }
                }
            }
        }
    });
}

// Refinement setup (Adaptive Zooming)
document.getElementById('btn-refine').addEventListener('click', () => {
    state.refinementRound++;
    
    const existingFreqs = new Set(state.points.map(p => p.freq));
    const newComparisons = [];
    const newPointsTemp = [];
    const addedFreqs = new Set();
    
    if (state.detectedExtrema.length === 0) {
        // Refine all intervals by inserting a point between each adjacent pair
        for (let i = 0; i < state.points.length - 1; i++) {
            const curr = state.points[i];
            const next = state.points[i + 1];
            const midFreq = Math.round(Math.sqrt(curr.freq * next.freq));
            
            if (!existingFreqs.has(midFreq) && !addedFreqs.has(midFreq)) {
                addedFreqs.add(midFreq);
                newPointsTemp.push({ freq: midFreq, level: 0, origin: 'refinement' });
                newComparisons.push({
                    type: 'refinement',
                    refFreq: curr.freq,
                    refLevel: curr.level,
                    targetFreq: midFreq,
                    role: 'right', // L(target) = L(ref) - score
                    freqA: curr.freq,
                    freqB: midFreq,
                    score: null
                });
            }
        }
    } else {
        // For each detected peak or dip (which may be a plateau), insert test points left and right
        state.detectedExtrema.forEach(ext => {
            // Logarithmic midpoints (geometric mean) relative to plateau edges and slope neighbors
            const leftFreq = Math.round(Math.sqrt(ext.freqLeftNeighbor * ext.freqStart));
            const rightFreq = Math.round(Math.sqrt(ext.freqEnd * ext.freqRightNeighbor));
            
            // Check duplication
            if (!existingFreqs.has(leftFreq) && !addedFreqs.has(leftFreq)) {
                addedFreqs.add(leftFreq);
                newPointsTemp.push({ freq: leftFreq, level: 0, origin: 'refinement' });
                newComparisons.push({
                    type: 'refinement',
                    refFreq: ext.freqStart,
                    refLevel: ext.level,
                    targetFreq: leftFreq,
                    role: 'left',
                    freqA: leftFreq,
                    freqB: ext.freqStart,
                    score: null
                });
            }
            
            if (!existingFreqs.has(rightFreq) && !addedFreqs.has(rightFreq)) {
                addedFreqs.add(rightFreq);
                newPointsTemp.push({ freq: rightFreq, level: 0, origin: 'refinement' });
                newComparisons.push({
                    type: 'refinement',
                    refFreq: ext.freqEnd,
                    refLevel: ext.level,
                    targetFreq: rightFreq,
                    role: 'right',
                    freqA: ext.freqEnd,
                    freqB: rightFreq,
                    score: null
                });
            }
        });
    }
    
    if (newComparisons.length === 0) {
        alert('これ以上詳細にスキャンするための追加ポイントがありません。');
        return;
    }
    
    // Add new points (level is temporarily set to 0, will be updated)
    state.points = [...state.points, ...newPointsTemp];
    state.points.sort((a, b) => a.freq - b.freq);
    
    // Set comparison queue to new tasks
    state.comparisons = newComparisons;
    state.currentCompIndex = 0;
    
    // Launch test screen
    showScreen('test');
    startComparison();
});

// Setup manual sweep verification
let isSweeping = false;
function initSweepVerification() {
    const sweepToggle = document.getElementById('btn-sweep-toggle');
    const sweepSlider = document.getElementById('input-sweep-freq');
    const sweepBubble = document.getElementById('sweep-freq-bubble');
    const lblMin = document.getElementById('lbl-sweep-min');
    const lblMax = document.getElementById('lbl-sweep-max');
    
    lblMin.textContent = `${state.freqMin.toLocaleString()} Hz`;
    lblMax.textContent = `${state.freqMax.toLocaleString()} Hz`;
    
    // Setup slider bounds
    sweepSlider.min = state.freqMin;
    sweepSlider.max = state.freqMax;
    sweepSlider.value = Math.round(Math.sqrt(state.freqMin * state.freqMax)); // geometric center
    sweepBubble.textContent = `${parseInt(sweepSlider.value).toLocaleString()} Hz`;
    
    // Reset sweeping state
    if (isSweeping) {
        stopOscillator();
        isSweeping = false;
        sweepToggle.textContent = '▶ スイープ音を再生';
        sweepToggle.classList.remove('btn-danger');
        sweepToggle.classList.add('btn-primary');
    }
}

function setupResultsSweep() {
    const sweepToggle = document.getElementById('btn-sweep-toggle');
    const sweepSlider = document.getElementById('input-sweep-freq');
    const sweepBubble = document.getElementById('sweep-freq-bubble');
    
    sweepToggle.addEventListener('click', () => {
        if (!isSweeping) {
            initAudio();
            const freq = parseInt(sweepSlider.value);
            playTone(freq);
            
            sweepToggle.textContent = '⏹ スイープ音を停止';
            sweepToggle.classList.remove('btn-primary');
            sweepToggle.classList.add('btn-danger');
            isSweeping = true;
        } else {
            stopOscillator();
            sweepToggle.textContent = '▶ スイープ音を再生';
            sweepToggle.classList.remove('btn-danger');
            sweepToggle.classList.add('btn-primary');
            isSweeping = false;
        }
    });
    
    sweepSlider.addEventListener('input', (e) => {
        const freq = parseInt(e.target.value);
        sweepBubble.textContent = `${freq.toLocaleString()} Hz`;
        
        if (isSweeping) {
            // Direct frequency update for smooth sweep (no fading)
            if (oscillator) {
                oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
            }
        }
    });
}

// Keyboard shortcuts for convenience
function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        if (state.screen !== 'test') return;
        
        const key = e.key;
        if (key === '1') {
            submitScore(2); // A is louder
        } else if (key === '2') {
            submitScore(1); // A is slightly louder
        } else if (key === '3') {
            submitScore(0); // Same
        } else if (key === '4') {
            submitScore(-1); // B is slightly louder
        } else if (key === '5') {
            submitScore(-2); // B is louder
        } else if (key === ' ' || key === 'Spacebar') {
            e.preventDefault();
            const comp = state.comparisons[state.currentCompIndex];
            if (state.isAutoPlaying) {
                stopAllPlayback();
            } else {
                startAutoToggle(comp.freqA, comp.freqB);
            }
        } else if (key.toLowerCase() === 's') {
            stopAllPlayback();
        }
    });
}
