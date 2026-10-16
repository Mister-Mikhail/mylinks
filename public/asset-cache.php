<?php
function asset_cache_cleanup() {
    // A bounded, opportunistic sweep keeps old versioned assets from accumulating.
    if (random_int(1, 100) !== 1) return;
    $cutoff = time() - 30 * 86400;
    foreach (array('mylinks-avatar-cache-*', 'mylinks-link-icon-*') as $pattern) {
        foreach (glob(sys_get_temp_dir() . '/' . $pattern) ?: array() as $path) {
            if (!is_file($path) || filemtime($path) >= $cutoff) continue;
            if (substr($path, -5) === '.lock') {
                $lock = @fopen($path, 'c');
                if (!$lock) continue;
                if (@flock($lock, LOCK_EX | LOCK_NB)) { @unlink($path); flock($lock, LOCK_UN); }
                fclose($lock);
            } else @unlink($path);
        }
    }
}
