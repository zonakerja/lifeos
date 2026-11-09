/**
 * Penanda rekaman audio yang sedang berjalan, untuk aksi di luar editor yang menutupnya tanpa lewat navigasi biasa
 * (logout membersihkan sesi lalu membongkar seluruh halaman, sehingga pencegah navigasi editor tidak sempat bekerja).
 */
let activeRecordings = 0;

/** Tandai rekaman dimulai; fungsi yang dikembalikan menandai rekaman berakhir. */
export function markRecordingActive() {
  activeRecordings++;
  return () => {
    activeRecordings--;
  };
}

export const isRecordingActive = () => activeRecordings > 0;
