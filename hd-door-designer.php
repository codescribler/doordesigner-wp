<?php
/**
 * Plugin Name:       Hertfordshire Doors — Door Designer
 * Plugin URI:        https://github.com/codescribler/doordesigner-wp
 * Description:       Enquiry-only composite-door configurator for Hertfordshire Doors. A customer visually designs a door; the spec is captured in Endurance's exact option vocabulary and emailed/stored as an enquiry. No pricing, no sizes, no lock selection.
 * Version:           0.2.41
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Dreamfree
 * Author URI:        https://dreamfree.co.uk
 * License:           GPL-2.0-or-later
 * Text Domain:       hd-door-designer
 *
 * Update mechanism:  GitHub releases via YahnisElsts/plugin-update-checker (see includes/class-hd-updater.php and README.md).
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
define( 'HD_DD_VERSION', '0.2.41' );
define( 'HD_DD_FILE', __FILE__ );
define( 'HD_DD_DIR', plugin_dir_path( __FILE__ ) );
define( 'HD_DD_URL', plugin_dir_url( __FILE__ ) );
define( 'HD_DD_BASENAME', plugin_basename( __FILE__ ) );
define( 'HD_DD_SLUG', 'hd-door-designer' );

// REST namespace shared by the catalogue + enquiry endpoints.
define( 'HD_DD_REST_NS', 'hd-door-designer/v1' );

// Where Daniel drops the extractor output (endurance-catalogue-full.json).
define( 'HD_DD_DATA_DIR', HD_DD_DIR . 'data/' );

// ---------------------------------------------------------------------------
// Autoload our includes (simple, predictable — no Composer autoloader needed
// for the plugin's own classes; vendored libs load separately).
// ---------------------------------------------------------------------------
require_once HD_DD_DIR . 'includes/class-hd-activator.php';
require_once HD_DD_DIR . 'includes/class-hd-repository.php';
require_once HD_DD_DIR . 'includes/class-hd-catalogue.php';
require_once HD_DD_DIR . 'includes/class-hd-image-proxy.php';
require_once HD_DD_DIR . 'includes/class-hd-lock-deriver.php';
require_once HD_DD_DIR . 'includes/class-hd-mailer.php';
require_once HD_DD_DIR . 'includes/class-hd-enquiry.php';
require_once HD_DD_DIR . 'includes/class-hd-shortcode.php';
require_once HD_DD_DIR . 'includes/class-hd-assets.php';
require_once HD_DD_DIR . 'includes/class-hd-admin.php';
require_once HD_DD_DIR . 'includes/class-hd-updater.php';
require_once HD_DD_DIR . 'includes/class-hd-plugin.php';

// ---------------------------------------------------------------------------
// Lifecycle hooks
// ---------------------------------------------------------------------------
register_activation_hook( __FILE__, array( 'HD_DD_Activator', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'HD_DD_Activator', 'deactivate' ) );

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
add_action( 'plugins_loaded', array( 'HD_DD_Plugin', 'instance' ) );
