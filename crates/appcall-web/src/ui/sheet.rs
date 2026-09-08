use super::*;

/// Synthetic component fixture, exposed only by the local preview example.
pub fn component_sheet() -> String {
    let mut html = String::from("<main class=\"ui-component-sheet\"><h1>Signal primitives</h1><section><h2>Buttons</h2><div class=\"ui-sheet-row\">");
    for (variant, label) in [
        (ButtonVariant::Primary, "Primary"),
        (ButtonVariant::Secondary, "Secondary"),
        (ButtonVariant::Quiet, "Quiet"),
        (ButtonVariant::Danger, "Delete"),
        (ButtonVariant::Icon, "×"),
    ] {
        for size in [ButtonSize::Sm, ButtonSize::Md, ButtonSize::Lg] {
            html.push_str(
                &Button {
                    variant,
                    size,
                    aria_label: matches!(variant, ButtonVariant::Icon).then_some("Close preview"),
                    ..Button::new(label)
                }
                .render(),
            );
        }
        for (disabled, busy) in [(true, false), (false, true)] {
            html.push_str(
                &Button {
                    variant,
                    disabled,
                    busy,
                    working_label: Some(if matches!(variant, ButtonVariant::Icon) {
                        "…"
                    } else {
                        "Working…"
                    }),
                    aria_label: matches!(variant, ButtonVariant::Icon).then_some("Close preview"),
                    ..Button::new(label)
                }
                .render(),
            );
        }
    }
    for (disabled, busy, progress) in [
        (true, false, None),
        (false, true, None),
        (false, true, Some(42)),
        (false, false, None),
    ] {
        html.push_str(
            &Button {
                disabled,
                busy,
                progress,
                working_label: Some("Saving changes…"),
                ..Button::new("Save")
            }
            .render(),
        );
    }
    html.push_str("</div><p>Each variant: 28, 32, 36, disabled, working. Hover, press, or Tab to inspect interactive states. Save shows sample 42% progress and reserves the working label width.</p></section><section><h2>Fields</h2><form id=\"sheet-fields\" method=\"post\" action=\"/preview/fields\">");
    for (id, kind, label) in [
        ("sheet-text", InputType::Text, "Name"),
        ("sheet-password", InputType::Password, "Password"),
        ("sheet-email", InputType::Email, "Email"),
        ("sheet-number", InputType::Number, "Retries"),
        ("sheet-hidden", InputType::Hidden, "Hidden"),
        ("sheet-checkbox", InputType::Checkbox, "Enabled"),
    ] {
        let mut field = Field::new(id, id, label, Control::Input(kind));
        field.value = if matches!(kind, InputType::Checkbox) {
            "true"
        } else {
            ""
        };
        field.checked = true;
        if matches!(kind, InputType::Email) {
            field.help = "Use your work address.";
            field.error = "Enter a valid email address.";
            field.required = true;
            field.value = "retained@example";
            field.autocomplete = Some("email");
        }
        html.push_str(&field.render());
    }
    let mut text = Field::new("sheet-notes", "notes", "Notes", Control::Textarea);
    text.value = "Retained <notes> & details";
    html.push_str(&text.render());
    let options = [
        SelectOption {
            value: "a",
            label: "First",
            disabled: false,
        },
        SelectOption {
            value: "b",
            label: "Selected",
            disabled: false,
        },
        SelectOption {
            value: "c",
            label: "Unavailable",
            disabled: true,
        },
    ];
    let mut select = Field::new(
        "sheet-select",
        "choice",
        "Connection",
        Control::Select(&options),
    );
    select.value = "b";
    html.push_str(&select.render());
    let mut disabled = Field::new(
        "sheet-disabled",
        "disabled",
        "Disabled",
        Control::Input(InputType::Text),
    );
    disabled.disabled = true;
    disabled.value = "Read-only fixture";
    html.push_str(&disabled.render());
    html.push_str("</form></section><section><h2>Tags and states</h2><div class=\"ui-sheet-row\">");
    html.push_str(&tag("oauth2"));
    html.push_str(&tag("read-only"));
    for (tone, label) in [
        (Tone::Running, "Running"),
        (Tone::Ok, "Active"),
        (Tone::Warn, "Backing off"),
        (Tone::Dead, "Failed"),
        (Tone::Idle, "Idle"),
    ] {
        html.push_str(&state(tone, label));
    }
    html.push_str("</div></section><section><h2>Navigation and consequences</h2>");
    html.push_str(&back_link(
        "Back to connectors",
        LocalPath::new("/app/connectors").unwrap(),
    ));
    html.push_str(
        &ConfirmButton {
            id: "sheet-delete",
            trigger: "Delete connection",
            heading: "Delete sample connection?",
            body: "This permanently deletes the sample connection.",
            confirm: "Delete connection",
            action: LocalPath::new("/preview/delete").unwrap(),
            form: None,
        }
        .render(),
    );
    html.push_str("</section>");
    html.push_str(
        &EmptyState {
            title: "No connections yet",
            body: "Connect an account to run your first tool.",
            action_label: "Browse connectors",
            action_href: LocalPath::new("/app/connectors").unwrap(),
        }
        .render(),
    );
    html.push_str("<section><h2>Long content at narrow widths</h2><div class=\"ui-sheet-row\">");
    let long = "UnbrokenConnectionIdentifier0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    html.push_str(
        &Button {
            working_label: Some(long),
            ..Button::new("Save changes")
        }
        .render(),
    );
    html.push_str(
        &Button {
            working_label: Some(long),
            busy: true,
            ..Button::new("Save changes")
        }
        .render(),
    );
    html.push_str(&tag(long));
    html.push_str(&state(Tone::Warn, long));
    html.push_str("</div>");
    html.push_str(
        &EmptyState {
            title: long,
            body: long,
            action_label: long,
            action_href: LocalPath::new("/app/connectors").unwrap(),
        }
        .render(),
    );
    html.push_str("</section></main>");
    html
}
