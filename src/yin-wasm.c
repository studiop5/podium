#include <math.h>

// YIN pitch detector with silence detection and confidence
// Returns frequency, writes confidence to *confidence_out
float yinf0(float *x, int N, int sr, float min_threshold, float *confidence_out) {
  int i, j, k, lag = -1, n;
  float sum_squares = 0.0;
  float rms;

  // Calculate RMS from the raw input buffer
  for(i = 0; i < N; i++) {
    sum_squares += x[i] * x[i];
  }
  rms = sqrtf(sum_squares / N);

  // Check if signal is too weak
  if(rms < min_threshold) {
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
  int W = (int) (0.05 * sr), min = sr / 1500, max = sr / 40;
  float d[max], dp[max];
  float f_yin, I, Q, omega, delta_f, freqs[3], mags[3], M_minus, M_0, M_plus, denom, f_refined;

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
    dp[i] = d[i] / (sum / i);
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
    float delta = (s2 - s0) / (2.0 * (2.0 * s1 - s2 - s0));
    tau_refined = lag + delta;
  } else {
    tau_refined = (float)lag;
  }

  // Convert tau to frequency
  f_yin = sr / tau_refined;

  // Return the YIN frequency (parabolic interpolation already applied)
  return f_yin;
}
