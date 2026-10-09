<?php
/**
 * The email a saver gets, and the "saved design" note to the owner.
 * Run: php tests/php/save-mailer.test.php
 */
require __DIR__ . '/wp-stubs.php';

$payload = array(
	'reference'  => 'HD-2026-000060',
	'designName' => 'Ketu in Sage',
	'customer'   => array( 'name' => '', 'telephone' => '', 'email' => 'jo@example.com', 'postcode' => '' ),
	'design'     => array( 'Door Design' => array( 'label' => 'Ketu', 'id' => 1 ), 'Door Colour (External)' => array( 'label' => 'Sage', 'id' => 2 ) ),
	'image'      => 'https://example.test/wp-content/uploads/hd-door-designer/enquiries/HD-2026-000060.png',
);
$link = 'https://example.test/door-designer/?design=abc123abc123';

// --- Guide price setting ---------------------------------------------------------------
hd_test_reset();
check( 'Fitted doors typically cost £1,500 to £4,000. Most of our customers pay around £2,000.' === HD_DD_Trust_Settings::guide_price(), 'default guide price is the agreed sentence' );
check( HD_DD_Trust_Settings::guide_price() === HD_DD_Trust_Settings::front_config()['guidePrice'], 'the browser gets the same text' );
$clean = HD_DD_Trust_Settings::sanitize( array( 'guide_price' => " <b>From £1,500</b>\nfitted " ), HD_DD_Plugin::settings() );
check( 'From £1,500 fitted' === $clean['guide_price'], 'markup and line breaks are stripped' );
$clean = HD_DD_Trust_Settings::sanitize( array( 'guide_price' => str_repeat( 'é', 400 ) ), HD_DD_Plugin::settings() );
check( 200 === mb_strlen( $clean['guide_price'] ), 'capped at 200 characters' );
$clean = HD_DD_Trust_Settings::sanitize( array( 'guide_price' => '' ), HD_DD_Plugin::settings() );
check( '' === $clean['guide_price'], 'empty is allowed (hides the line)' );

// --- Saver email -----------------------------------------------------------------------
hd_test_reset();
check( true === HD_DD_Save_Mailer::send_saver( $payload, $link ), 'saver email is sent' );
$m = $GLOBALS['hd_test_mail'][0];
check( 'jo@example.com' === $m['to'], 'to the saver' );
check( 'Your door design: Ketu in Sage' === $m['subject'], 'subject names the design (got "' . $m['subject'] . '")' );
check( false !== strpos( $m['message'], 'Open my design' ) && false !== strpos( $m['message'], 'design=abc123abc123' ), 'has the link back' );
check( false !== strpos( $m['message'], 'Get my exact price' ) && false !== strpos( $m['message'], 'price=1' ), 'has the price button' );
check( false !== strpos( $m['message'], '£1,500 to £4,000' ), 'has the guide price' );
check( false !== strpos( $m['message'], 'HD-2026-000060.png' ), 'has the door picture' );
check( false === strpos( $m['message'], 'Thank you, ' ), 'does not greet by a name it does not have' );

hd_test_reset();
update_option( 'hd_dd_settings', array( 'guide_price' => '' ) );
HD_DD_Save_Mailer::send_saver( $payload, $link );
check( false === strpos( $GLOBALS['hd_test_mail'][0]['message'], '£1,500' ), 'no guide price when the setting is empty' );

hd_test_reset();
HD_DD_Save_Mailer::send_saver( $payload, '' );
check( false === strpos( $GLOBALS['hd_test_mail'][0]['message'], 'Get my exact price' ), 'no buttons without a link' );

hd_test_reset();
$bad = $payload; $bad['customer']['email'] = 'not-an-email';
check( false === HD_DD_Save_Mailer::send_saver( $bad, $link ) && array() === $GLOBALS['hd_test_mail'], 'no email to a bad address' );

// --- Owner note ------------------------------------------------------------------------
hd_test_reset();
HD_DD_Save_Mailer::send_owner_saved( $payload, 'owner@example.com' );
$m = $GLOBALS['hd_test_mail'][0];
check( 'New saved design — jo@example.com' === $m['subject'], 'owner subject (got "' . $m['subject'] . '")' );
check( false !== strpos( $m['message'], 'has not asked for a price yet' ), 'says no price was requested' );
check( false !== strpos( $m['message'], 'HD-2026-000060' ) && false !== strpos( $m['message'], 'Ketu' ), 'reference and design are listed' );
check( 0 !== strpos( $m['subject'], 'New door enquiry' ), 'never looks like an enquiry in the inbox' );

check( false === strpos( $m['message'], 'design=' ), 'no design link when none is given' );

hd_test_reset();
HD_DD_Save_Mailer::send_owner_saved( $payload, 'owner@example.com', array(), $link );
$m = $GLOBALS['hd_test_mail'][0];
check( false !== strpos( $m['message'], 'Open this design: ' . $link ), 'the owner note links to the design in the designer' );
check( false !== strpos( $m['message'], 'their own email' ), 'and says the customer was sent their own email with the buttons' );

hd_test_reset();
$flagged = $payload; $flagged['flags'] = array( 'honeypot' );
HD_DD_Save_Mailer::send_owner_saved( $flagged, 'owner@example.com' );
check( 0 === strpos( $GLOBALS['hd_test_mail'][0]['subject'], '[Possible bot] ' ), 'a honeypot hit is marked' );

hd_test_done( 'save-mailer.test.php' );
