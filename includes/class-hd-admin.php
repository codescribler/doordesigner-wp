<?php
/**
 * wp-admin: an enquiries list (each with a copyable structured payload) and a
 * settings screen (recipient email, GitHub repo for updates, GDPR retention).
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Admin {

	const MENU_SLUG     = 'hd-door-enquiries';
	const SETTINGS_SLUG = 'hd-door-settings';
	const OPTION        = 'hd_dd_settings';
	const CAP           = 'manage_options';

	/** @var HD_DD_Repository */
	private $repository;

	public function __construct( HD_DD_Repository $repository ) {
		$this->repository = $repository;
	}

	public function register() {
		add_action( 'admin_menu', array( $this, 'menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
	}

	public function menu() {
		add_menu_page(
			__( 'Door Enquiries', 'hd-door-designer' ),
			__( 'Door Enquiries', 'hd-door-designer' ),
			self::CAP,
			self::MENU_SLUG,
			array( $this, 'render_list' ),
			'dashicons-store',
			26
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Door Designer Settings', 'hd-door-designer' ),
			__( 'Settings', 'hd-door-designer' ),
			self::CAP,
			self::SETTINGS_SLUG,
			array( $this, 'render_settings' )
		);
	}

	// -------------------------------------------------------------------
	// Settings API
	// -------------------------------------------------------------------
	public function register_settings() {
		register_setting(
			'hd_dd_settings_group',
			self::OPTION,
			array( 'sanitize_callback' => array( $this, 'sanitize_settings' ) )
		);
	}

	public function sanitize_settings( $input ) {
		$current = HD_DD_Plugin::settings();
		return array(
			'recipient_email' => isset( $input['recipient_email'] ) && is_email( $input['recipient_email'] )
				? sanitize_email( $input['recipient_email'] )
				: $current['recipient_email'],
			'page_id'         => isset( $input['page_id'] ) ? absint( $input['page_id'] ) : $current['page_id'],
			'retention_days'  => isset( $input['retention_days'] ) ? absint( $input['retention_days'] ) : $current['retention_days'],
			'github_repo'     => isset( $input['github_repo'] ) ? esc_url_raw( trim( $input['github_repo'] ) ) : $current['github_repo'],
			'asset_base'      => isset( $input['asset_base'] ) ? esc_url_raw( trim( $input['asset_base'] ) ) : $current['asset_base'],
		);
	}

	public function render_settings() {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		$s = HD_DD_Plugin::settings();
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Door Designer Settings', 'hd-door-designer' ); ?></h1>
			<?php if ( isset( $_GET['hd_dd_cache_cleared'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
				<div class="notice notice-success is-dismissible"><p><?php esc_html_e( 'Cached preview images cleared.', 'hd-door-designer' ); ?></p></div>
			<?php endif; ?>
			<form method="post" action="options.php">
				<?php settings_fields( 'hd_dd_settings_group' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="hd_recipient"><?php esc_html_e( 'Enquiry recipient email', 'hd-door-designer' ); ?></label></th>
						<td><input name="<?php echo esc_attr( self::OPTION ); ?>[recipient_email]" id="hd_recipient" type="email" class="regular-text" value="<?php echo esc_attr( $s['recipient_email'] ); ?>" /></td>
					</tr>
					<tr>
						<th scope="row"><label for="hd_repo"><?php esc_html_e( 'GitHub repo (for updates)', 'hd-door-designer' ); ?></label></th>
						<td>
							<input name="<?php echo esc_attr( self::OPTION ); ?>[github_repo]" id="hd_repo" type="url" class="regular-text" placeholder="https://github.com/OWNER/hd-door-designer" value="<?php echo esc_attr( $s['github_repo'] ); ?>" />
							<p class="description"><?php esc_html_e( 'Used by the update checker so tagged GitHub releases appear as plugin updates.', 'hd-door-designer' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="hd_asset_base"><?php esc_html_e( 'Preview image base URL', 'hd-door-designer' ); ?></label></th>
						<td>
							<input name="<?php echo esc_attr( self::OPTION ); ?>[asset_base]" id="hd_asset_base" type="url" class="regular-text" placeholder="(use the catalogue's captured origin)" value="<?php echo esc_attr( $s['asset_base'] ); ?>" />
							<p class="description"><?php esc_html_e( 'Where door preview images are served from. Leave blank to use the captured Endurance host (dev); set to your local mirror/CDN for production.', 'hd-door-designer' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="hd_retention"><?php esc_html_e( 'Retain enquiries (days)', 'hd-door-designer' ); ?></label></th>
						<td>
							<input name="<?php echo esc_attr( self::OPTION ); ?>[retention_days]" id="hd_retention" type="number" min="0" class="small-text" value="<?php echo esc_attr( $s['retention_days'] ); ?>" />
							<p class="description"><?php esc_html_e( '0 = keep indefinitely. Set a value to support a GDPR retention policy (auto-purge can be wired later).', 'hd-door-designer' ); ?></p>
						</td>
					</tr>
				</table>
				<?php submit_button(); ?>
			</form>

			<hr>
			<h2><?php esc_html_e( 'Preview images', 'hd-door-designer' ); ?></h2>
			<p class="description">
				<?php esc_html_e( 'Door preview images are fetched from the supplier once and cached on this site. Clear the cache if the supplier updates their artwork — images re-download on next view.', 'hd-door-designer' ); ?>
			</p>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="hd_dd_clear_img_cache" />
				<?php wp_nonce_field( 'hd_dd_clear_img_cache' ); ?>
				<?php submit_button( __( 'Clear cached preview images', 'hd-door-designer' ), 'secondary', 'submit', false ); ?>
			</form>

			<p class="description" style="margin-top:1.5em">
				Built by <a href="https://dreamfree.co.uk" target="_blank" rel="noopener">Dreamfree</a>
				&middot; Support: <a href="mailto:daniel@dreamfree.co.uk">daniel@dreamfree.co.uk</a>
			</p>
		</div>
		<?php
	}

	// -------------------------------------------------------------------
	// Enquiries list
	// -------------------------------------------------------------------
	public function render_list() {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		$rows  = $this->repository->list( 200, 0 );
		$total = $this->repository->count();
		?>
		<div class="wrap">
			<h1>
				<?php esc_html_e( 'Door Enquiries', 'hd-door-designer' ); ?>
				<span class="count">(<?php echo esc_html( $total ); ?>)</span>
			</h1>

			<?php if ( empty( $rows ) ) : ?>
				<p><?php esc_html_e( 'No enquiries yet.', 'hd-door-designer' ); ?></p>
			<?php else : ?>
				<table class="wp-list-table widefat fixed striped">
					<thead>
						<tr>
							<th><?php esc_html_e( 'Reference', 'hd-door-designer' ); ?></th>
							<th><?php esc_html_e( 'Received', 'hd-door-designer' ); ?></th>
							<th><?php esc_html_e( 'Customer', 'hd-door-designer' ); ?></th>
							<th><?php esc_html_e( 'Contact', 'hd-door-designer' ); ?></th>
							<th><?php esc_html_e( 'Door', 'hd-door-designer' ); ?></th>
							<th><?php esc_html_e( 'Payload', 'hd-door-designer' ); ?></th>
						</tr>
					</thead>
					<tbody>
						<?php foreach ( $rows as $row ) : ?>
							<?php
							$design  = json_decode( (string) $row->design, true );
							$payload = json_decode( (string) $row->payload, true );
							$summary = $this->design_summary( $design );
							?>
							<tr>
								<td><strong><?php echo esc_html( $row->reference ); ?></strong></td>
								<td><?php echo esc_html( mysql2date( 'j M Y H:i', $row->created_at ) ); ?></td>
								<td><?php echo esc_html( $row->customer_name ); ?><br><small><?php echo esc_html( $row->customer_postcode ); ?></small></td>
								<td>
									<a href="mailto:<?php echo esc_attr( $row->customer_email ); ?>"><?php echo esc_html( $row->customer_email ); ?></a><br>
									<a href="tel:<?php echo esc_attr( $row->customer_phone ); ?>"><?php echo esc_html( $row->customer_phone ); ?></a>
								</td>
								<td>
									<?php if ( is_array( $payload ) && ! empty( $payload['image'] ) ) : ?>
										<a href="<?php echo esc_url( $payload['image'] ); ?>" target="_blank" rel="noopener">
											<img src="<?php echo esc_url( $payload['image'] ); ?>" alt="" loading="lazy" style="width:56px;height:auto;border:1px solid #ddd;border-radius:3px;display:block;margin-bottom:4px;" />
										</a>
									<?php endif; ?>
									<?php echo esc_html( $summary ); ?>
								</td>
								<td>
									<details>
										<summary><?php esc_html_e( 'Copy JSON', 'hd-door-designer' ); ?></summary>
										<textarea readonly rows="12" style="width:100%;font-family:monospace;font-size:11px;"><?php echo esc_textarea( wp_json_encode( $payload ? $payload : $design, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) ); ?></textarea>
									</details>
								</td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>
			<?php endif; ?>
		</div>
		<?php
	}

	/** One-line "Single Door · Ketu · Irish Oak" style summary for the list. */
	private function design_summary( $design ) {
		if ( ! is_array( $design ) ) {
			return '';
		}
		$pick = array();
		foreach ( array( 'Door Type', 'Door Design', 'Door Style', 'Door Colour (External)', 'Door Colour' ) as $heading ) {
			if ( isset( $design[ $heading ]['label'] ) && '' !== $design[ $heading ]['label'] ) {
				$pick[] = $design[ $heading ]['label'];
			}
		}
		return implode( ' · ', array_unique( $pick ) );
	}
}
