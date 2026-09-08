use appcall_web::ui::component_sheet;
use appcall_web::ui::*;

#[test]
fn unsafe_urls_are_rejected_and_dynamic_text_cannot_create_attributes() {
    for path in [
        "javascript:alert(1)",
        "//evil.test",
        "/\\evil.test",
        "/\n/evil.test",
        "https://evil.test",
    ] {
        assert!(LocalPath::new(path).is_none());
    }
    let html = Button {
        aria_label: Some("\" onfocus=\"alert(1)"),
        ..Button::new("<script>&")
    }
    .render();
    assert!(html.contains("&lt;script&gt;&amp;"));
    assert!(!html.contains("aria-label=\"\" onfocus="));
    assert!(!html.contains("<progress"));
}

#[test]
fn button_native_form_semantics_and_disabled_links_are_preserved() {
    let path = LocalPath::new("/save?x=1&y=2").unwrap();
    let html = Button {
        target: ButtonTarget::Button {
            kind: ButtonType::Submit,
            form: Some("account-form"),
            action: Some(path),
        },
        ..Button::new("Save")
    }
    .render();
    assert!(html.contains("type=\"submit\" form=\"account-form\" formaction=\"/save?x=1&amp;y=2\" formmethod=\"post\""));
    let html = Button {
        target: ButtonTarget::Link(path),
        disabled: true,
        ..Button::new("Open")
    }
    .render();
    assert!(html.contains("aria-disabled=\"true\""));
    assert!(!html.contains("href="));
    let html = Button {
        busy: true,
        progress: Some(101),
        ..Button::new("Save")
    }
    .render();
    assert!(!html.contains("<progress"));
}

#[test]
fn fields_keep_values_associations_and_developer_owned_datastar_binding() {
    let mut field = Field::new("tk-action", "action", "Tool", Control::Textarea);
    field.value = "</textarea><script>alert(1)</script>";
    field.form = Some("tool-form");
    field.on_input_debounced = Some("@get('/options')");
    let html = field.render();
    assert!(html.contains("id=\"tk-action\" name=\"action\" form=\"tool-form\""));
    assert!(html.contains("data-on:input__debounce.300ms="));
    assert!(!html.contains("aria-describedby"));
    assert!(!html.contains("<script>"));
    let options = [SelectOption {
        value: "a&b",
        label: "A < B",
        disabled: false,
    }];
    field.control = Control::Select(&options);
    field.value = "a&b";
    assert!(field
        .render()
        .contains("<option value=\"a&amp;b\" selected>A &lt; B</option>"));
}

#[test]
fn dynamic_field_source_is_escaped_data_not_executable_code() {
    let source = LocalPath::new("/options?source=actor&label=\"<name>").unwrap();
    let html = Field {
        options_source: Some(source),
        on_input_debounced: Some("@get(evt.target.dataset.optionsSource)"),
        ..Field::new(
            "actor-search",
            "",
            "Search actor",
            Control::Input(InputType::Search),
        )
    }
    .render();
    assert!(
        html.contains("data-options-source=\"/options?source=actor&amp;label=&quot;&lt;name&gt;\"")
    );
    assert!(
        html.contains("data-on:input__debounce.300ms=\"@get(evt.target.dataset.optionsSource)\"")
    );
    assert!(!html.contains("label=\"<name>"));
}

#[test]
fn confirmation_with_existing_form_never_creates_a_nested_form() {
    let html = ConfirmButton {
        id: "delete",
        trigger: "Delete",
        heading: "Delete?",
        body: "Cannot undo.",
        confirm: "Delete",
        action: LocalPath::new("/delete").unwrap(),
        form: Some("existing"),
    }
    .render();
    assert!(!html.contains("<form"));
    assert!(html.contains("form=\"existing\" formaction=\"/delete\" formmethod=\"post\""));
    assert!(!html.contains("onclick"));
}

#[test]
fn copy_confirmations_escape_target_text_and_keep_native_standalone_submission() {
    let html = ConfirmButton {
        id: "replay-one",
        trigger: "Run this again",
        heading: "Dispatch this event again?",
        body: "Dispatch event <event&\"one> again? Consumers may process the event again.",
        confirm: "Run this again",
        action: LocalPath::new("/app/triggers/event_1/replay").unwrap(),
        form: None,
    }
    .render();
    assert!(html.contains("Dispatch event &lt;event&amp;&quot;one&gt; again?"));
    assert_eq!(html.matches("<form ").count(), 1);
    assert!(html.contains(
        "form=\"replay-one-form\" formaction=\"/app/triggers/event_1/replay\" formmethod=\"post\""
    ));
    assert!(html.contains("data-confirm-cancel autofocus"));
    assert!(html.find("</dialog>").unwrap() < html.find("<form ").unwrap());
}

#[test]
fn sheet_renders_every_button_variant_size_and_honest_working_state() {
    let html = component_sheet();
    for variant in ["primary", "secondary", "quiet", "danger", "icon"] {
        assert!(
            html.contains(&format!("ui-button-{variant}")),
            "missing {variant}"
        );
    }
    for size in ["sm", "md", "lg"] {
        assert!(html.contains(&format!("ui-button-{size}")));
    }
    assert!(html.contains("aria-busy=\"true\" disabled"));
    assert!(html.contains("<progress max=\"100\" value=\"42\""));
    assert_eq!(html.matches("<progress").count(), 1);
    assert!(!html.contains("spinner"));
}

#[test]
fn sheet_has_associated_fields_named_states_and_consequence_dialog() {
    let html = component_sheet();
    assert!(html.contains("aria-describedby=\"sheet-email-help sheet-email-error\""));
    assert!(html.contains("aria-invalid=\"true\""));
    for kind in ["text", "password", "email", "number", "hidden", "checkbox"] {
        assert!(html.contains(&format!("type=\"{kind}\"")));
    }
    for tone in ["running", "ok", "warn", "dead", "idle"] {
        assert!(html.contains(&format!("ui-state-{tone}")));
    }
    assert!(html.contains("<textarea"));
    assert!(html.contains("<select"));
    assert!(html.contains("<dialog id=\"sheet-delete\""));
    assert!(html.contains("data-confirm-cancel autofocus"));
    assert!(html.contains("method=\"post\" action=\"/preview/delete\""));
    assert!(html.contains("This permanently deletes the sample connection."));
    assert!(html.contains("ui-empty-state"));
    assert!(html.contains("ui-back-link"));
    assert!(html.contains("id=\"sheet-email-error\" class=\"ui-field-error\" aria-live=\"polite\""));
}

#[test]
fn button_and_field_golden_rendering() {
    assert_eq!(Button::new("Save & continue").render(), "<button class=\"ui-button ui-button-primary ui-button-md\" type=\"button\"><span class=\"ui-button-labels\"><span class=\"ui-button-idle\" aria-hidden=\"false\">Save &amp; continue</span><span class=\"ui-button-working\" aria-hidden=\"true\">Save &amp; continue</span></span></button>");
    let mut field = Field::new("email", "email", "Email", Control::Input(InputType::Email));
    field.help = "Work address";
    field.error = "Check address";
    field.value = "a&b";
    assert_eq!(field.render(), "<div class=\"ui-field\"><label for=\"email\">Email</label><input class=\"ui-control\" id=\"email\" name=\"email\" type=\"email\" value=\"a&amp;b\" aria-describedby=\"email-help email-error\" aria-invalid=\"true\"><p id=\"email-help\" class=\"ui-field-help\">Work address</p><p id=\"email-error\" class=\"ui-field-error\" aria-live=\"polite\">Check address</p></div>");
}

#[test]
fn long_content_fixture_and_mobile_target_contracts_are_present() {
    let sheet = component_sheet();
    assert!(sheet.contains("UnbrokenConnectionIdentifier0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"));
    assert!(sheet.contains("Long content at narrow widths"));
    let css = include_str!("../styles/app.css");
    assert!(
        css.contains(".ui-button-labels { display: grid; min-width: 0; overflow-wrap: anywhere; }")
    );
    assert!(!css.contains("grid-area: 1 / 1; white-space: nowrap"));
    assert!(css.contains(".ui-field:has(.ui-control[type=checkbox]) > label { min-height: 44px;"));
    assert!(css.contains(".ui-tag, .ui-state, .ui-empty-state { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }"));
}

#[test]
fn legacy_dashboard_controls_do_not_override_signal_geometry() {
    let css = include_str!("../static/dashboard.css");
    assert!(!css.contains("[data-dashboard] main button { min-height: 44px; }"));
    assert!(css.contains("main button:not(.ui-button)"));
    assert!(css.contains("main input:not(.ui-control)"));
}

#[test]
fn adjacent_help_and_error_fields_do_not_stretch_other_controls() {
    assert!(include_str!("../styles/app.css")
        .contains(".ui-field { display: grid; align-content: start; gap: 4px; }"));
}

#[test]
fn every_button_variant_size_and_state_matches_golden_markup() {
    for (variant, class) in [
        (ButtonVariant::Primary, "primary"),
        (ButtonVariant::Secondary, "secondary"),
        (ButtonVariant::Quiet, "quiet"),
        (ButtonVariant::Danger, "danger"),
        (ButtonVariant::Icon, "icon"),
    ] {
        for (size, size_class) in [
            (ButtonSize::Sm, "sm"),
            (ButtonSize::Md, "md"),
            (ButtonSize::Lg, "lg"),
        ] {
            for (disabled, busy, attributes, idle_hidden, working_hidden) in [
                (false, false, "", "false", "true"),
                (true, false, " disabled", "false", "true"),
                (false, true, " aria-busy=\"true\" disabled", "true", "false"),
            ] {
                let button = Button {
                    variant,
                    size,
                    disabled,
                    busy,
                    aria_label: Some("Run tool"),
                    working_label: Some("Running tool"),
                    ..Button::new("Run")
                };
                let expected=format!("<button class=\"ui-button ui-button-{class} ui-button-{size_class}\" type=\"button\" aria-label=\"Run tool\"{attributes}><span class=\"ui-button-labels\"><span class=\"ui-button-idle\" aria-hidden=\"{idle_hidden}\">Run</span><span class=\"ui-button-working\" aria-hidden=\"{working_hidden}\">Running tool</span></span></button>");
                assert_eq!(button.render(), expected);
            }
        }
    }
}
