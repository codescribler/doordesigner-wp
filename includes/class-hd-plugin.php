<?php
/**
 * Main orchestrator. Instantiates each module and lets it register its own hooks.
 * Kept deliberately thin — modules own their behaviour.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

final class HD_DD_Plugin {

	/** @var HD_DD_Plugin|null */
	private static $instance = null;

	/** @var HD_DD_Catalogue */
	public $catalogue;

	/** @var HD_DD_Repository */
	public $repository;

	/** @var HD_DD_Shortcode */
	public $shortcode;

	/** @var HD_DD_Assets */
	public $assets;

	/** @var HD_DD_Image_Proxy */
	public $image_proxy;

	/** @var HD_DD_Enquiry */
	public $enquiry;

	/** @var HD_DD_Admin */
	public $admin;

	/** @var HD_DD_Updater */
	public $updater;

	/**
	 * Singleton accessor (also the plugins_loaded callback).
	 *
	 * @return HD_DD_Plugin
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		load_plugin_textdomain( 'hd-door-designer', false, dirname( HD_DD_BASENAME ) . '/languages' );

		$this->repository  = new HD_DD_Repository();
		$this->catalogue   = new HD_DD_Catalogue();
		$this->image_proxy = new HD_DD_Image_Proxy( $this->catalogue );
		$this->assets      = new HD_DD_Assets( $this->catalogue );
		$this->shortcode  = new HD_DD_Shortcode( $this->assets );
		$this->enquiry    = new HD_DD_Enquiry( $this->repository, $this->catalogue );
		$this->admin      = new HD_DD_Admin( $this->repository );
		$this->updater    = new HD_DD_Updater();

		$this->catalogue->register();
		$this->image_proxy->register();
		$this->assets->register();
		$this->shortcode->register();
		$this->enquiry->register();
		$this->admin->register();
		$this->updater->register();
	}

	/** Convenience accessor for the plugin settings array. */
	public static function settings() {
		$defaults = array(
			'recipient_email' => 'daniel@dreamfree.co.uk',
			'page_id'         => 0,
			'retention_days'  => 0, // 0 = keep indefinitely; surfaced in admin for GDPR.
			'github_repo'     => '', // e.g. https://github.com/OWNER/hd-door-designer
			'asset_base'      => '', // preview image host; empty = use the model's captured origin.
		);
		$saved = get_option( 'hd_dd_settings', array() );
		return wp_parse_args( is_array( $saved ) ? $saved : array(), $defaults );
	}
}
