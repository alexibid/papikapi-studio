"""Limits the simplified figure must respect against the stage-2 figure; any failure stops the step.
Feature loss is measured and reported, but it does not block: the user's rule is volume and size within 1%."""


def gate_failures(quality, settings):
    failures = []
    if abs(quality["volumeChangePercent"]) > settings["max_volume_change_percent"]:
        failures.append(f"volume {quality['volumeChangePercent']}% > ±{settings['max_volume_change_percent']}%")
    if quality["dimensionChangePercent"] > settings["max_dimension_change_percent"]:
        failures.append(f"dimensions {quality['dimensionChangePercent']}% > {settings['max_dimension_change_percent']}%")
    if not quality["airtight"]:
        failures.append(f"not airtight ({quality['openEdges']} open, {quality['nonManifoldEdges']} non-manifold edges)")
    return failures
