<?php
/**
 * The two emails a save sends: Daniel's notification (design name, "(not given)" for a
 * missing phone) and the customer's (saved + price to follow + a link back), with an
 * awkward design name escaped correctly.  Run: php tests/php/save-emails.test.php
 */
require __DIR__ . '/wp-stubs.php';

function hd_test_mails( array $overrides = array() ) {
	hd_test_reset();
	$enq  = new HD_DD_Enquiry( new HD_DD_Repository(), new HD_DD_Catalogue() );
	$body = array_merge(
		array(
			'hd_hp'      => '',
			'designName' => 'Front door option 1',
			'name'       => 'Real Customer',
			'email'      => 'real@example.com',
			'postcode'   => 'AL1 1AA',
			'design'     => array(
				'Door Type'   => array( 'label' => 'Single Door', 'id' => null ),
				'Door Design' => array( 'label' => 'Ketu', 'id' => 12 ),
			),
			'pageUrl'    => 'https://example.test/door-designer/',
		),
		$overrides
	);
	$enq->rest_submit( hd_test_request( 'POST', '/hd-door-designer/v1/enquiry', $body ) );
	return $GLOBALS['hd_test_mail'];
}

// --- 1) Owner notification ---------------------------------------------------------------
$mail = hd_test_mails();
check( 2 === count( $mail ), 'two emails sent' );
$owner = $mail[0];
check( 0 === strpos( $owner['subject'], 'New door enquiry HD-' ), 'owner subject unchanged (inbox filters depend on it)' );
check( false !== strpos( $owner['message'], 'Front door option 1' ), 'owner body shows the design name' );
check( false !== strpos( $owner['message'], '(not given)' ), 'owner body says the phone was not given' );
check( false !== strpos( $owner['message'], '"designName": "Front door option 1"' ), 'JSON block carries designName' );

$mail = hd_test_mails( array( 'telephone' => '01234 567890' ) );
check( false !== strpos( $mail[0]['message'], '01234 567890' ) && false === strpos( $mail[0]['message'], '(not given)' ), 'a given phone is printed as before' );

// --- 2) Customer email -------------------------------------------------------------------
$mail = hd_test_mails();
$cust = $mail[1];
check( 'real@example.com' === $cust['to'], 'customer email goes to the customer' );
check( 1 === preg_match( '/^Your saved door design: Front door option 1 \(HD-\d{4}-\d{6}\)$/', $cust['subject'] ), 'customer subject names the design (got "' . $cust['subject'] . '")' );
check( false !== strpos( $cust['message'], 'Open my design' ), 'button says Open my design' );
check( false !== strpos( $cust['message'], 'https://example.test/door-designer/?design=' ), 'button links back to the design' );
check( false !== strpos( $cust['message'], 'is saved' ) && false !== strpos( $cust['message'], 'price' ), 'body says it is saved and a price will follow' );
check( false !== strpos( $cust['message'], 'Front door option 1' ), 'body shows the design name' );

// --- 3) An awkward design name -------------------------------------------------------------
$mail = hd_test_mails( array( 'designName' => 'Mum\'s "big" door & porch <script>x</script>' ) );
$cust = $mail[1];
check( false !== strpos( $cust['subject'], 'Mum\'s "big" door & porch' ), 'subject carries the name unescaped (got "' . $cust['subject'] . '")' );
check( false === strpos( $cust['subject'], '<' ), 'no markup in the subject' );
check( false !== strpos( $cust['message'], 'Mum&#039;s &quot;big&quot; door &amp; porch' ), 'HTML body escapes the name' );
check( false === strpos( $cust['message'], '<script>' ), 'no script tag reaches the HTML body' );

// --- 4) Copy rule: no email promises that we will not phone ------------------------------------
$banned = '/\bno\s+(sales\s+|cold\s+)?calls?\b|\b(won[’\']?t|will not|never|don[’\']?t)\s+(call|phone|ring)\b|\bonly\s+(call|phone|ring)\s+(you|if)\b/i';
check( 0 === preg_match( $banned, $mail[0]['message'] . $mail[1]['message'] ), 'neither email promises not to call' );

hd_test_done( 'save-emails.test.php' );
