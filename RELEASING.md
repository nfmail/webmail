# Releasing NF Mail

NF Mail releases are built only from a version-matching, signed annotated Git
tag. `VERSION` and `package.json` must contain the same version, and the tag is
`v<VERSION>` (for example, `v1.7.7-nf.1`). Existing releases and assets are
never overwritten.

Create the tag from a CI-green commit and publish it to `origin`:

```bash
git tag -s "v$(cat VERSION)" -m "NF Mail $(cat VERSION)"
git push origin "v$(cat VERSION)"
```

The tag workflow verifies the GitHub signature, builds the exact commit for
amd64 and arm64 with the pinned Node/npm toolchain, and publishes the release
only after both builds succeed. Each standalone tarball contains `LICENSE`,
`NOTICE`, `VERSION`, `product.json`, and `SOURCE.json`. The release also includes deterministic
SPDX SBOMs, source manifests, and SHA-256 checksums. GitHub artifact
attestations provide cryptographically signed build provenance and SBOM
claims.

Verify a downloaded artifact:

```bash
sha256sum --check SHA256SUMS
gh attestation verify nf-mail-<version>-linux-<arch>.tar.gz --repo nfmail/webmail
```

The source manifest maps every artifact to its exact public NF commit and tag,
plus the upstream Bulwark base. A manual workflow dispatch builds the same
files for rehearsal but never creates a GitHub release.
