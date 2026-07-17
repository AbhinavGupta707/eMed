# Local finger-PPG provider

This package is an engineering-feasibility implementation for the synthetic HomeRounds hackathon prototype. It is not clinically validated, does not diagnose or classify rhythm, and must not be used with real patient data. Automated waveform tests verify deterministic software behaviour only. A physical iPhone comparison remains a later, explicitly human release gate and still would not establish medical accuracy.

The browser adapter requests the rear camera and performs transient, in-memory frame aggregation in a dedicated worker. Only derived numeric samples (timestamp, mean channel/intensity, saturation, coverage, motion, and cadence) enter the signal path. Raw frames are never returned from the frame source, logged, persisted, uploaded, or included in result objects. The local provider has no network transport.

Quality gating covers duration, cadence and jitter, dropped frames, saturation, coverage, motion, signal strength, detrending/band-pass smoothing, spectral/autocorrelation agreement, and plausible range. A measurement is normalized only after all gates pass. A session receives at most one explicit retry result; another retry-quality capture fails terminally.
