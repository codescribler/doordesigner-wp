<?php
/**
 * The Designer 4 emails: the link email to the visitor and the two notes to the business.
 * Run: php tests/php/d4-mailer.test.php
 */
require __DIR__ . '/wp-stubs.php';

$payload = array(
	'reference'  => 'HD-2026-000090',
	'designName' => 'Etna in French Navy',
	'customer'   => array( 'name' => '', 'telephone' => '', 'email' => 'nicola@example.com', 'postcode' => '' ),
	'design'     => array( 'Door Design' => array( 'label' => 'Etna', 'id' => 1 ), 'Door Colour (External)' => array( 'label' => 'French Navy', 'id' => 2 ) ),
	'image'      => 'https://example.test/wp-content/uploads/hd-door-designer/enquiries/HD-2026-000090.png',
);
$url = 'https://example.test/door-designer/?designs=abc123abc123&k=' . str_repeat( 'a', 40 );

hd_test_reset();
check( true === HD_DD_D4_Mailer::send_link( $payload, $url ), 'the link email is sent' );
$m    = $GLOBALS['hd_test_mail'][0];
$body = $m['message'];
check( 'nicola@example.com' === $m['to'] && 'Your door design: Etna in French Navy' === $m['subject'], 'to the visitor, subject names the design (got "' . $m['subject'] . '")' );
check( 1 === substr_count( $body, '<a ' ) && false !== strpos( $body, 'Open my designs' ), 'one button, Open my designs' );
check( false !== strpos( $body, 'designs=abc123abc123' ) && false !== strpos( $body, 'k=' . str_repeat( 'a', 40 ) ), 'it points at designs= and k=' );
check( false !== strpos( $body, "Your price is on its way. We'll email it within 1 working day." ), 'it says the price follows within 1 working day' );
check( false === strpos( $body, 'price=1' ) && false === stripos( $body, 'Get my exact price' ), 'no price=1 link and no price button' );
check( false !== strpos( $body, 'Answer two quick questions on that page for a closer estimate.' ), 'the closer-estimate line is there' );
check( false !== strpos( $body, 'HD-2026-000090.png' ) && false !== strpos( $body, 'French Navy' ) && false !== strpos( $body, 'Door Colour (External)' ), 'door picture, name and the table of choices' );
check( false !== strpos( $body, '£1,500 to £4,000' ), 'the guide price shows when set' );
check( in_array( 'Content-Type: text/html; charset=UTF-8', $m['headers'], true ) && in_array( 'From: Hertfordshire Doors <noreply@example.test>', $m['headers'], true ) && in_array( 'Reply-To: daniel@dreamfree.co.uk', $m['headers'], true ), 'HTML, same From and Reply-To rule as the saver email' );

hd_test_reset();
update_option( 'hd_dd_settings', array( 'guide_price' => '' ) );
HD_DD_D4_Mailer::send_link( $payload, '' );
$body = $GLOBALS['hd_test_mail'][0]['message'];
check( false === strpos( $body, '£1,500' ) && 0 === substr_count( $body, '<a ' ), 'no guide price when blank; no button when there is no link' );
check( false === HD_DD_D4_Mailer::send_link( array( 'customer' => array( 'email' => 'nope' ) ), $url ), 'no email to a bad address' );

hd_test_reset();
HD_DD_D4_Mailer::send_owner_lead( $payload, 'owner@example.com', array( '/tmp/x.png' ) );
$m = $GLOBALS['hd_test_mail'][0];
check( 'New Designer 4 lead HD-2026-000090 — nicola@example.com' === $m['subject'] && 'owner@example.com' === $m['to'], 'the owner lead subject (got "' . $m['subject'] . '")' );
check( false === strpos( $m['subject'], 'New door enquiry' ) && array( '/tmp/x.png' ) === $m['attachments'], 'never "New door enquiry"; the picture is attached' );
check( in_array( 'Reply-To: nicola@example.com', $m['headers'], true ) && false !== strpos( $m['message'], 'Door Colour (External):' ), 'reply goes to the visitor; the design is listed' );
HD_DD_D4_Mailer::send_owner_door_added( $payload, 'owner@example.com' );
check( 'Designer 4: another door HD-2026-000090 — nicola@example.com' === $GLOBALS['hd_test_mail'][1]['subject'], 'the door-added subject' );

hd_test_done( 'd4-mailer' );
