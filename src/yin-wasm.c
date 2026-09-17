#include <math.h>

// YIN pitch detector with silence detection and confidence
// Returns frequency, writes confidence to *confidence_out
float yinf0(float *x, int N, int sr, float min_threshold, float *confidence_out) {
  *confidence_out = 1.0;
  if(N < 4 || sr <= 0) return 0.0;

  // Keep every comparison x[j + lag] inside the supplied input buffer.
  // Reserve at least half the buffer for the comparison window.
  int min = sr / 1500, max = sr / 40;
  if(min < 1) min = 1;
  if(max > N / 2) max = N / 2;
  if(max < min) return 0.0;
  int W = sr / 20;
  if(W > N - max) W = N - max;
  if(W < 1) return 0.0;

  int i, j, k, lag = -1;
  float sum_squares = 0.0;
  float rms;

  // Calculate RMS from the raw input buffer
  for(i = 0; i < N; i++) {
    sum_squares += x[i] * x[i];
  }
  rms = sqrtf(sum_squares / N);

  // Check if signal is too weak
  if(!isfinite(rms) || rms <= 0.0 || rms < min_threshold) {
    *confidence_out = 1.0; // No confidence
    return 0.0; // Silence indicator
  }

  // Remove DC bias
  float mean = 0.0;
  for(i = 0; i < N; i++) {
    mean += x[i];
  }
  mean /= N;
  for(i = 0; i < N; i++) {
    x[i] -= mean;
  }

  // YIN algorithm variables
  float t = .10, s0, s1, s2, dx, sum;
  // Lag max is included in the loops below.
  float d[max + 1], dp[max + 1];
  float f_yin;

  // YIN difference function
  for(i = 0; i <= max; i++) {
    sum = 0.0;
    for(j = 0, k = i; j < W;) {
      dx = x[j++] - x[k++];
      sum += dx * dx;
    }
    d[i] = sum;
  }

  // Cumulative mean normalized difference
  dp[0] = 1.0;
  for(sum = 0, i = 1; i <= max; i++) {
    sum += d[i];
    dp[i] = sum > 0.0 ? d[i] / (sum / i) : 1.0;
  }

  // Find first dip below threshold, then walk to local minimum
  for(i = min; i <= max; i++) {
    if(dp[i] < t) {
       // Found first value below threshold, now find local minimum
       lag = i;
       while(i + 1 < max && dp[i + 1] < dp[i]) {
         i++;
         lag = i;
       }
       break;
     }
  }
  // If no value below threshold, use absolute minimum
  if(lag == -1) {
    for(i = min, lag = min; i <= max; i++) {
      if(dp[i] < dp[lag]) lag = i;
    }
  }

  // Store confidence (aperiodicity) - lower is better
  *confidence_out = dp[lag];

  // Parabolic interpolation around tau for sub-sample accuracy
  float tau_refined;
  if(lag > 0 && lag < max) {
    s0 = dp[lag - 1];
    s1 = dp[lag];
    s2 = dp[lag + 1];
    // Parabolic interpolation to find fractional tau
    float denominator = 2.0 * (2.0 * s1 - s2 - s0);
    float delta = denominator != 0.0 ? (s2 - s0) / denominator : 0.0;
    // A boundary candidate need not be a local minimum; do not extrapolate.
    if(!isfinite(delta) || fabsf(delta) > 0.5f) delta = 0.0;
    tau_refined = lag + delta;
  } else {
    tau_refined = (float)lag;
  }

  // Convert tau to frequency
  f_yin = sr / tau_refined;

  // Return the YIN frequency (parabolic interpolation already applied)
  return f_yin;
}
