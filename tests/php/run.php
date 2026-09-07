<?php
/**
 * Runs every tests/php/*.test.php in its own PHP process (each one boots the WP
 * stubs fresh).  Run: php tests/php/run.php   — exits non-zero if any test fails.
 */
$fails = 0;
foreach ( glob( __DIR__ . '/*.test.php' ) as $test ) {
	passthru( escapeshellarg( PHP_BINARY ) . ' ' . escapeshellarg( $test ), $code );
	if ( 0 !== $code ) {
		$fails++;
	}
}
echo $fails ? "\n$fails test file(s) failed\n" : "\nall PHP tests passed\n";
exit( $fails ? 1 : 0 );
