<?php
/**
 * wp-admin: an enquiries list (each with a copyable structured payload), a
 * per-enquiry detail view (the full design spec, for re-creating it in the
 * designer) and a settings screen (recipient email, GitHub repo, retention).
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
		add_action( 'admin_post_hd_dd_delete_enquiries', array( $this, 'handle_delete' ) );
	}

	/**
	 * Delete the selected enquiries (admin-post handler for the enquiries list form).
	 */
	public function handle_delete() {
		if ( ! current_user_can( self::CAP ) || ! check_admin_referer( 'hd_dd_delete_enquiries' ) ) {
			wp_die( esc_html__( 'Not allowed.', 'hd-door-designer' ) );
		}
		$ids   = isset( $_POST['enquiry_ids'] ) ? array_map( 'absint', (array) wp_unslash( $_POST['enquiry_ids'] ) ) : array();
		$count = $this->repository->delete( $ids );

		$back = wp_get_referer() ? wp_get_referer() : admin_url( 'admin.php?page=' . self::MENU_SLUG );
		wp_safe_redirect( add_query_arg( 'hd_dd_deleted', (int) $count, remove_query_arg( 'hd_dd_deleted', $back ) ) );
		exit;
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

	/**
	 * Validate a newline/comma-separated list of recipient emails down to a clean,
	 * de-duplicated comma-separated string. Falls back to the current value if none are valid
	 * (so a typo can't wipe out who gets enquiries).
	 */
	private function sanitize_email_list( $raw, $fallback ) {
		$emails = array();
		foreach ( preg_split( '/[\s,]+/', (string) $raw ) as $part ) {
			$part = trim( $part );
			if ( '' !== $part && is_email( $part ) ) {
				$emails[ strtolower( $part ) ] = sanitize_email( $part );
			}
		}
		return $emails ? implode( ', ', array_values( $emails ) ) : $fallback;
	}

	public function sanitize_settings( $input ) {
		$current = HD_DD_Plugin::settings();
		return array(
			'recipient_email' => $this->sanitize_email_list( isset( $input['recipient_email'] ) ? $input['recipient_email'] : '', $current['recipient_email'] ),
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
						<th scope="row"><label for="hd_recipient"><?php esc_html_e( 'Enquiry recipient emails', 'hd-door-designer' ); ?></label></th>
						<td>
							<textarea name="<?php echo esc_attr( self::OPTION ); ?>[recipient_email]" id="hd_recipient" class="regular-text" rows="3"><?php echo esc_textarea( $s['recipient_email'] ); ?></textarea>
							<p class="description"><?php esc_html_e( 'Every enquiry notification is sent to all of these. One address per line (or comma-separated).', 'hd-door-designer' ); ?></p>
						</td>
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
		$enquiry_id = isset( $_GET['enquiry'] ) ? absint( $_GET['enquiry'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only view selector.
		if ( $enquiry_id ) {
			$this->render_detail( $enquiry_id );
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

			<?php if ( isset( $_GET['hd_dd_deleted'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only success flag. ?>
				<div class="notice notice-success is-dismissible"><p>
					<?php
					$deleted_n = (int) $_GET['hd_dd_deleted']; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
					/* translators: %d: number of enquiries deleted */
					printf( esc_html( _n( '%d enquiry deleted.', '%d enquiries deleted.', $deleted_n, 'hd-door-designer' ) ), absint( $deleted_n ) );
					?>
				</p></div>
			<?php endif; ?>

			<?php if ( empty( $rows ) ) : ?>
				<p><?php esc_html_e( 'No enquiries yet.', 'hd-door-designer' ); ?></p>
			<?php else : ?>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" onsubmit="return hdDdConfirmDelete( this );">
				<input type="hidden" name="action" value="hd_dd_delete_enquiries" />
				<?php wp_nonce_field( 'hd_dd_delete_enquiries' ); ?>
				<p style="margin:8px 0;"><button type="submit" class="button hd-dd-delete-btn" style="color:#b32d2e;border-color:#b32d2e;"><?php esc_html_e( 'Delete selected', 'hd-door-designer' ); ?></button></p>
				<table class="wp-list-table widefat fixed striped">
					<thead>
						<tr>
							<td class="manage-column column-cb check-column" style="width:2.2em;"><input type="checkbox" onclick="hdDdToggleAll( this );" aria-label="<?php esc_attr_e( 'Select all', 'hd-door-designer' ); ?>" /></td>
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
								<th scope="row" class="check-column"><input type="checkbox" name="enquiry_ids[]" value="<?php echo (int) $row->id; ?>" aria-label="<?php echo esc_attr( sprintf( /* translators: %s: enquiry reference */ __( 'Select %s', 'hd-door-designer' ), $row->reference ) ); ?>" /></th>
								<td><a href="<?php echo esc_url( admin_url( 'admin.php?page=' . self::MENU_SLUG . '&enquiry=' . (int) $row->id ) ); ?>" aria-label="<?php echo esc_attr( sprintf( /* translators: %s: enquiry reference */ __( 'View details for %s', 'hd-door-designer' ), $row->reference ) ); ?>"><strong><?php echo esc_html( $row->reference ); ?></strong></a><?php echo self::status_badge( $row->status, $payload ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in status_badge(). ?></td>
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
				<p style="margin:8px 0;"><button type="submit" class="button hd-dd-delete-btn" style="color:#b32d2e;border-color:#b32d2e;"><?php esc_html_e( 'Delete selected', 'hd-door-designer' ); ?></button></p>
				</form>
				<script>
				function hdDdToggleAll( src ) { var f = src.closest( 'form' ); if ( f ) { f.querySelectorAll( 'input[name="enquiry_ids[]"]' ).forEach( function ( c ) { c.checked = src.checked; } ); } }
				function hdDdConfirmDelete( form ) { var n = form.querySelectorAll( 'input[name="enquiry_ids[]"]:checked' ).length; if ( ! n ) { window.alert( 'Please select at least one enquiry to delete.' ); return false; } return window.confirm( 'Permanently delete ' + n + ' selected ' + ( n === 1 ? 'enquiry' : 'enquiries' ) + '? This cannot be undone.' ); }
				</script>
			<?php endif; ?>
		</div>
		<?php
	}

	/**
	 * Single-enquiry view (admin.php?page=hd-door-enquiries&enquiry=ID): the full
	 * design spec in the catalogue's exact vocabulary, so the door can be
	 * re-created option by option in the designer.
	 */
	private function render_detail( $id ) {
		$back = admin_url( 'admin.php?page=' . self::MENU_SLUG );
		$row  = $this->repository->get( $id );
		if ( ! $row ) {
			?>
			<div class="wrap">
				<h1><?php esc_html_e( 'Door Enquiries', 'hd-door-designer' ); ?></h1>
				<div class="notice notice-error"><p><?php esc_html_e( 'Enquiry not found — it may have been deleted.', 'hd-door-designer' ); ?></p></div>
				<p><a href="<?php echo esc_url( $back ); ?>">&larr; <?php esc_html_e( 'Back to enquiries', 'hd-door-designer' ); ?></a></p>
			</div>
			<?php
			return;
		}

		$design  = json_decode( (string) $row->design, true );
		$payload = json_decode( (string) $row->payload, true );
		$image   = ( is_array( $payload ) && ! empty( $payload['image'] ) ) ? $payload['image'] : '';
		$lock    = ( is_array( $payload ) && isset( $payload['derived']['suggestedLock'] ) ) ? $payload['derived']['suggestedLock'] : '';

		// "Open in designer" reuses the customer's reload link: designer page + ?design=token.
		$designer_url = '';
		if ( ! empty( $row->token ) ) {
			$page_id = (int) HD_DD_Plugin::settings()['page_id'];
			$base    = $page_id ? get_permalink( $page_id ) : home_url( '/' );
			if ( $base ) {
				$designer_url = add_query_arg( 'design', rawurlencode( $row->token ), $base );
			}
		}
		?>
		<div class="wrap">
			<h1><?php echo esc_html( $row->reference ); ?></h1>
			<?php $status_label = self::status_label( $row->status, $payload ); ?>
			<?php if ( '' !== $status_label ) : ?>
				<div class="notice <?php echo 'failed' === (string) $row->status ? 'notice-error' : 'notice-warning'; ?>"><p><?php echo esc_html( $status_label ); ?></p></div>
			<?php endif; ?>
			<p>
				<a href="<?php echo esc_url( $back ); ?>">&larr; <?php esc_html_e( 'Back to enquiries', 'hd-door-designer' ); ?></a>
				<?php if ( $designer_url ) : ?>
					&nbsp;<a href="<?php echo esc_url( $designer_url ); ?>" target="_blank" rel="noopener" class="button button-primary"><?php esc_html_e( 'Open in designer', 'hd-door-designer' ); ?></a>
				<?php endif; ?>
			</p>

			<div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;">
				<?php if ( $image ) : ?>
					<div style="flex:0 0 auto;">
						<a href="<?php echo esc_url( $image ); ?>" target="_blank" rel="noopener">
							<img src="<?php echo esc_url( $image ); ?>" alt="<?php echo esc_attr( sprintf( /* translators: %s: enquiry reference */ __( 'Door preview for %s', 'hd-door-designer' ), $row->reference ) ); ?>" style="width:280px;height:auto;border:1px solid #ddd;border-radius:4px;background:#fff;" />
						</a>
					</div>
				<?php endif; ?>

				<div style="flex:1 1 420px;min-width:320px;max-width:720px;">
					<h2><?php esc_html_e( 'Enquiry', 'hd-door-designer' ); ?></h2>
					<table class="widefat striped">
						<tbody>
							<tr><th style="width:200px;"><?php esc_html_e( 'Received', 'hd-door-designer' ); ?></th><td><?php echo esc_html( mysql2date( 'j M Y H:i', $row->created_at ) ); ?></td></tr>
							<tr><th><?php esc_html_e( 'Customer', 'hd-door-designer' ); ?></th><td><?php echo esc_html( $row->customer_name ); ?></td></tr>
							<tr><th><?php esc_html_e( 'Email', 'hd-door-designer' ); ?></th><td><a href="mailto:<?php echo esc_attr( $row->customer_email ); ?>"><?php echo esc_html( $row->customer_email ); ?></a></td></tr>
							<tr><th><?php esc_html_e( 'Telephone', 'hd-door-designer' ); ?></th><td><a href="tel:<?php echo esc_attr( $row->customer_phone ); ?>"><?php echo esc_html( $row->customer_phone ); ?></a></td></tr>
							<tr><th><?php esc_html_e( 'Postcode', 'hd-door-designer' ); ?></th><td><?php echo esc_html( $row->customer_postcode ); ?></td></tr>
							<?php if ( '' !== $lock ) : ?>
								<tr><th><?php esc_html_e( 'Suggested lock', 'hd-door-designer' ); ?></th><td><?php echo esc_html( $lock ); ?></td></tr>
							<?php endif; ?>
						</tbody>
					</table>

					<h2><?php esc_html_e( 'Design specification', 'hd-door-designer' ); ?></h2>
					<?php if ( is_array( $design ) && $design ) : ?>
						<p class="description"><?php esc_html_e( 'Every option exactly as chosen — work through the designer top to bottom to re-create it.', 'hd-door-designer' ); ?></p>
						<table class="widefat striped">
							<tbody>
								<?php foreach ( $design as $heading => $choice ) : ?>
									<tr>
										<th style="width:200px;"><?php echo esc_html( $heading ); ?></th>
										<td>
											<?php echo esc_html( is_array( $choice ) && isset( $choice['label'] ) ? $choice['label'] : '' ); ?>
											<?php if ( is_array( $choice ) && isset( $choice['id'] ) && null !== $choice['id'] ) : ?>
												<small style="color:#8a8e96;">(#<?php echo (int) $choice['id']; ?>)</small>
											<?php endif; ?>
										</td>
									</tr>
								<?php endforeach; ?>
							</tbody>
						</table>
					<?php else : ?>
						<p><?php esc_html_e( 'No design data was stored with this enquiry.', 'hd-door-designer' ); ?></p>
					<?php endif; ?>

					<h2><?php esc_html_e( 'Full payload', 'hd-door-designer' ); ?></h2>
					<textarea readonly rows="14" style="width:100%;font-family:monospace;font-size:11px;" onclick="this.select();"><?php echo esc_textarea( wp_json_encode( $payload ? $payload : $design, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) ); ?></textarea>
				</div>
			</div>
		</div>
		<?php
	}

	/**
	 * Plain-text label for a row that needs a second look: a honeypot hit ('flagged') or a
	 * submission that never became an enquiry ('failed'). Empty for a normal enquiry.
	 *
	 * @param string     $status  Row status.
	 * @param array|null $payload Decoded payload JSON.
	 * @return string
	 */
	public static function status_label( $status, $payload ) {
		$status = (string) $status;
		if ( 'flagged' === $status ) {
			return __( 'Possible bot (hidden field filled — usually just autofill; treat as real)', 'hd-door-designer' );
		}
		if ( 'failed' !== $status ) {
			return '';
		}
		$label   = __( 'FAILED', 'hd-door-designer' );
		$failure = ( is_array( $payload ) && isset( $payload['failure'] ) && is_array( $payload['failure'] ) ) ? $payload['failure'] : array();
		if ( ! empty( $failure['message'] ) ) {
			$label .= ' — ' . $failure['message'];
			if ( ! empty( $failure['fields'] ) && is_array( $failure['fields'] ) ) {
				foreach ( $failure['fields'] as $field => $msg ) {
					$label .= ' ' . $field . ': ' . $msg;
				}
			}
		}
		return $label;
	}

	/** The list's coloured badge for status_label(), or '' for a normal row. Escaped. */
	private static function status_badge( $status, $payload ) {
		$label = self::status_label( $status, $payload );
		if ( '' === $label ) {
			return '';
		}
		$style = 'failed' === (string) $status
			? 'background:#fde8e8;color:#b32d2e;border:1px solid #f0b4b4;'
			: 'background:#fff4d6;color:#7a5a00;border:1px solid #e8cf86;';
		return '<br><span style="display:inline-block;margin-top:4px;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:600;line-height:1.3;' . $style . '">' . esc_html( $label ) . '</span>';
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
