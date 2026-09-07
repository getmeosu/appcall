//! Shared Signal controls. Dynamic text is escaped; attribute names are private.
use crate::http::escape;
mod sheet;
pub use sheet::component_sheet;

/// Same-origin destinations keep actions and links free of executable schemes.
#[derive(Clone, Copy)]
pub struct LocalPath<'a>(&'a str);
impl<'a> LocalPath<'a> {
    pub fn new(value: &'a str) -> Option<Self> {
        (value.starts_with('/')
            && !value.starts_with("//")
            && !value.chars().any(|c| c.is_control() || c == '\\'))
        .then_some(Self(value))
    }
}

#[derive(Clone, Copy)]
pub enum ButtonVariant {
    Primary,
    Secondary,
    Quiet,
    Danger,
    Icon,
}
#[derive(Clone, Copy)]
pub enum ButtonSize {
    Sm,
    Md,
    Lg,
}
#[derive(Clone, Copy)]
pub enum ButtonType {
    Button,
    Submit,
    Reset,
}
#[derive(Clone, Copy)]
pub enum ShellAction {
    Navigation,
    CloseNavigation,
    Search,
    CloseSearch,
}
#[derive(Clone, Copy)]
pub enum ButtonTarget<'a> {
    Button {
        kind: ButtonType,
        form: Option<&'a str>,
        action: Option<LocalPath<'a>>,
    },
    Link(LocalPath<'a>),
}
pub struct Button<'a> {
    pub shell_action: Option<ShellAction>,
    pub label: &'a str,
    pub variant: ButtonVariant,
    pub size: ButtonSize,
    pub target: ButtonTarget<'a>,
    pub aria_label: Option<&'a str>,
    pub disabled: bool,
    pub working_label: Option<&'a str>,
    pub busy: bool,
    /// Actual operation-reported percentage. None means no progress indicator.
    pub progress: Option<u8>,
}
impl<'a> Button<'a> {
    pub fn new(label: &'a str) -> Self {
        Self {
            shell_action: None,
            label,
            variant: ButtonVariant::Primary,
            size: ButtonSize::Md,
            target: ButtonTarget::Button {
                kind: ButtonType::Button,
                form: None,
                action: None,
            },
            aria_label: None,
            disabled: false,
            working_label: None,
            busy: false,
            progress: None,
        }
    }
    pub fn render(&self) -> String {
        self.render_with(match self.shell_action {
            Some(ShellAction::Navigation) => {
                " id=\"nav-toggle\" aria-controls=\"dashboard-sidebar\" aria-expanded=\"false\""
            }
            Some(ShellAction::CloseNavigation) => " id=\"nav-close\"",
            Some(ShellAction::Search) => " data-cmdk-open",
            Some(ShellAction::CloseSearch) => " id=\"cmdk-close\"",
            None => "",
        })
    }
    fn render_with(&self, owned_attributes: &str) -> String {
        let variant = match self.variant {
            ButtonVariant::Primary => "primary",
            ButtonVariant::Secondary => "secondary",
            ButtonVariant::Quiet => "quiet",
            ButtonVariant::Danger => "danger",
            ButtonVariant::Icon => "icon",
        };
        let size = match self.size {
            ButtonSize::Sm => "sm",
            ButtonSize::Md => "md",
            ButtonSize::Lg => "lg",
        };
        let unavailable = self.disabled || self.busy;
        let is_link = matches!(self.target, ButtonTarget::Link(_));
        let tag = if is_link { "a" } else { "button" };
        let mut html = format!(
            "<{tag} class=\"ui-button ui-button-{variant} ui-button-{size}\"{owned_attributes}"
        );
        match self.target {
            ButtonTarget::Link(path) => {
                if unavailable {
                    html.push_str(" role=\"link\" aria-disabled=\"true\"");
                } else {
                    attr(&mut html, "href", path.0);
                }
            }
            ButtonTarget::Button { kind, form, action } => {
                attr(
                    &mut html,
                    "type",
                    match kind {
                        ButtonType::Button => "button",
                        ButtonType::Submit => "submit",
                        ButtonType::Reset => "reset",
                    },
                );
                optional_attr(&mut html, "form", form);
                if let Some(path) = action {
                    attr(&mut html, "formaction", path.0);
                    attr(&mut html, "formmethod", "post");
                }
            }
        }
        let accessible = self
            .aria_label
            .or_else(|| matches!(self.variant, ButtonVariant::Icon).then_some(self.label));
        optional_attr(&mut html, "aria-label", accessible);
        if self.busy {
            html.push_str(" aria-busy=\"true\"");
        }
        if unavailable && !is_link {
            html.push_str(" disabled");
        }
        html.push('>');
        let working = self.working_label.unwrap_or(self.label);
        html.push_str(&format!("<span class=\"ui-button-labels\"><span class=\"ui-button-idle\" aria-hidden=\"{}\">{}</span><span class=\"ui-button-working\" aria-hidden=\"{}\">{}</span></span>",self.busy,escape(self.label),!self.busy,escape(working)));
        if self.busy {
            if let Some(value) = self.progress.filter(|value| *value <= 100) {
                html.push_str(&format!("<progress max=\"100\" value=\"{value}\" aria-label=\"Operation progress\"></progress>"));
            }
        }
        html.push_str(&format!("</{tag}>"));
        html
    }
}

#[derive(Clone, Copy)]
pub enum InputType {
    Text,
    Password,
    Email,
    Number,
    Hidden,
    Checkbox,
    Search,
}
pub struct SelectOption<'a> {
    pub value: &'a str,
    pub label: &'a str,
    pub disabled: bool,
}
pub enum Control<'a> {
    Input(InputType),
    Textarea,
    Select(&'a [SelectOption<'a>]),
}
pub struct Field<'a> {
    pub id: &'a str,
    pub name: &'a str,
    pub label: &'a str,
    pub control: Control<'a>,
    pub value: &'a str,
    pub help: &'a str,
    pub error: &'a str,
    pub placeholder: &'a str,
    pub autocomplete: Option<&'a str>,
    pub required: bool,
    pub disabled: bool,
    pub checked: bool,
    pub form: Option<&'a str>,
    pub aria_label: Option<&'a str>,
    /// Developer-owned Datastar expression; never interpolate user input into code.
    pub on_input_debounced: Option<&'static str>,
}
impl<'a> Field<'a> {
    pub fn new(id: &'a str, name: &'a str, label: &'a str, control: Control<'a>) -> Self {
        Self {
            id,
            name,
            label,
            control,
            value: "",
            help: "",
            error: "",
            placeholder: "",
            autocomplete: None,
            required: false,
            disabled: false,
            checked: false,
            form: None,
            aria_label: None,
            on_input_debounced: None,
        }
    }
    pub fn render(&self) -> String {
        let hidden = matches!(self.control, Control::Input(InputType::Hidden));
        let mut html = if hidden {
            String::new()
        } else {
            format!(
                "<div class=\"ui-field\"><label for=\"{}\">{}</label>",
                escape(self.id),
                escape(self.label)
            )
        };
        let tag = match self.control {
            Control::Textarea => "textarea",
            Control::Select(_) => "select",
            _ => "input",
        };
        html.push_str(&format!("<{tag} class=\"ui-control\""));
        attr(&mut html, "id", self.id);
        attr(&mut html, "name", self.name);
        if let Control::Input(kind) = self.control {
            attr(
                &mut html,
                "type",
                match kind {
                    InputType::Text => "text",
                    InputType::Password => "password",
                    InputType::Email => "email",
                    InputType::Number => "number",
                    InputType::Hidden => "hidden",
                    InputType::Checkbox => "checkbox",
                    InputType::Search => "search",
                },
            );
            attr(&mut html, "value", self.value);
            if matches!(kind, InputType::Checkbox) && self.checked {
                html.push_str(" checked");
            }
        }
        optional_attr(&mut html, "form", self.form);
        optional_attr(&mut html, "aria-label", self.aria_label);
        optional_attr(&mut html, "autocomplete", self.autocomplete);
        optional_attr(
            &mut html,
            "data-on:input__debounce.300ms",
            self.on_input_debounced,
        );
        if !self.placeholder.is_empty() {
            attr(&mut html, "placeholder", self.placeholder);
        }
        if self.required {
            html.push_str(" required");
        }
        if self.disabled {
            html.push_str(" disabled");
        }
        if !hidden {
            let ids = [("help", self.help), ("error", self.error)]
                .iter()
                .filter(|(_, text)| !text.is_empty())
                .map(|(suffix, _)| format!("{}-{suffix}", self.id))
                .collect::<Vec<_>>()
                .join(" ");
            if !ids.is_empty() {
                attr(&mut html, "aria-describedby", &ids);
            }
            if !self.error.is_empty() {
                html.push_str(" aria-invalid=\"true\"");
            }
        }
        html.push('>');
        match &self.control {
            Control::Textarea => html.push_str(&format!("{}</textarea>", escape(self.value))),
            Control::Select(options) => {
                for option in *options {
                    html.push_str(&format!(
                        "<option value=\"{}\"{}{}>{}</option>",
                        escape(option.value),
                        if option.value == self.value {
                            " selected"
                        } else {
                            ""
                        },
                        if option.disabled { " disabled" } else { "" },
                        escape(option.label)
                    ));
                }
                html.push_str("</select>");
            }
            _ => {}
        }
        if !hidden {
            for (suffix, text) in [("help", self.help), ("error", self.error)] {
                if !text.is_empty() || suffix == "error" {
                    html.push_str(&format!(
                        "<p id=\"{}-{suffix}\" class=\"ui-field-{suffix}\"{}>{}</p>",
                        escape(self.id),
                        if suffix == "error" {
                            " aria-live=\"polite\""
                        } else {
                            ""
                        },
                        escape(text)
                    ));
                }
            }
            html.push_str("</div>");
        }
        html
    }
}

pub fn back_link(label: &str, href: LocalPath<'_>) -> String {
    format!(
        "<a class=\"ui-back-link\" href=\"{}\"><span aria-hidden=\"true\">←</span> {}</a>",
        escape(href.0),
        escape(label)
    )
}
pub fn tag(label: &str) -> String {
    format!("<span class=\"ui-tag\">{}</span>", escape(label))
}
pub enum Tone {
    Running,
    Ok,
    Warn,
    Dead,
    Idle,
}
pub fn state(tone: Tone, label: &str) -> String {
    let tone = match tone {
        Tone::Running => "running",
        Tone::Ok => "ok",
        Tone::Warn => "warn",
        Tone::Dead => "dead",
        Tone::Idle => "idle",
    };
    format!("<span class=\"ui-state ui-state-{tone}\"><span class=\"ui-state-rule\" aria-hidden=\"true\"></span>{}</span>",escape(label))
}
pub struct EmptyState<'a> {
    pub title: &'a str,
    pub body: &'a str,
    pub action_label: &'a str,
    pub action_href: LocalPath<'a>,
}
impl EmptyState<'_> {
    pub fn render(&self) -> String {
        let button = Button {
            target: ButtonTarget::Link(self.action_href),
            ..Button::new(self.action_label)
        };
        format!(
            "<section class=\"ui-empty-state\"><h3>{}</h3><p>{}</p>{}</section>",
            escape(self.title),
            escape(self.body),
            button.render()
        )
    }
}
pub struct ConfirmButton<'a> {
    /// Must be unique within the document.
    pub id: &'a str,
    pub trigger: &'a str,
    pub heading: &'a str,
    pub body: &'a str,
    pub confirm: &'a str,
    pub action: LocalPath<'a>,
    /// Associate an existing form, preserving hidden fields and its Datastar submit handler.
    /// Required when placing this component inside a form. None emits a standalone form.
    pub form: Option<&'a str>,
}
impl ConfirmButton<'_> {
    pub fn render(&self) -> String {
        let trigger = Button {
            variant: ButtonVariant::Danger,
            ..Button::new(self.trigger)
        };
        let mut html = trigger.render_with(&format!(
            " data-confirm-open=\"{}\" aria-haspopup=\"dialog\" aria-controls=\"{}\"",
            escape(self.id),
            escape(self.id)
        ));
        html.push_str(&format!("<dialog id=\"{}\" class=\"ui-confirm-dialog\" aria-labelledby=\"{}-heading\" aria-describedby=\"{}-body\"><h2 id=\"{}-heading\">{}</h2><p id=\"{}-body\">{}</p><div class=\"ui-confirm-actions\">",escape(self.id),escape(self.id),escape(self.id),escape(self.id),escape(self.heading),escape(self.id),escape(self.body)));
        let cancel = Button {
            variant: ButtonVariant::Secondary,
            ..Button::new("Cancel")
        };
        html.push_str(&cancel.render_with(" data-confirm-cancel autofocus"));
        let form_id = format!("{}-form", self.id);
        let confirm = Button {
            variant: ButtonVariant::Danger,
            target: ButtonTarget::Button {
                kind: ButtonType::Submit,
                form: Some(self.form.unwrap_or(&form_id)),
                action: Some(self.action),
            },
            ..Button::new(self.confirm)
        };
        html.push_str(&confirm.render_with(" data-confirm-submit"));
        html.push_str("</div></dialog>");
        // Callers inside an existing form use its ID; standalone controls own a form.
        if self.form.is_none() {
            html.push_str(&format!(
                "<form id=\"{}\" method=\"post\" action=\"{}\"></form>",
                escape(&form_id),
                escape(self.action.0)
            ));
        }
        html
    }
}
fn attr(html: &mut String, name: &'static str, value: &str) {
    html.push_str(&format!(" {name}=\"{}\"", escape(value)));
}
fn optional_attr(html: &mut String, name: &'static str, value: Option<&str>) {
    if let Some(value) = value {
        attr(html, name, value);
    }
}
