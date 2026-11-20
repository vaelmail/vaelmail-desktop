use percent_encoding::percent_decode_str;
use serde::Serialize;
use url::Url;

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
pub struct Mailto {
    pub to: Vec<String>,
    pub cc: Vec<String>,
    pub bcc: Vec<String>,
    pub subject: String,
    pub body: String,
}

fn addresses(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(|part| part.trim().to_owned())
        .filter(|part| !part.is_empty() && !part.contains(['\r', '\n']))
        .collect()
}

pub fn parse(input: &str) -> Option<Mailto> {
    let url = Url::parse(input).ok()?;
    if url.scheme() != "mailto" {
        return None;
    }
    let mut mailto = Mailto {
        to: addresses(&percent_decode_str(url.path()).decode_utf8_lossy()),
        ..Mailto::default()
    };
    for (key, value) in url.query_pairs() {
        match key.to_ascii_lowercase().as_str() {
            "to" => mailto.to.extend(addresses(&value)),
            "cc" => mailto.cc.extend(addresses(&value)),
            "bcc" => mailto.bcc.extend(addresses(&value)),
            "subject" => mailto.subject = value.replace(['\r', '\n'], " "),
            "body" => mailto.body = value.into_owned(),
            _ => {}
        }
    }
    Some(mailto)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_recipients_and_fields() {
        let message =
            parse("mailto:a@x.org,b@y.org?cc=c@z.org&subject=Hello%20there&body=Line%0Atwo")
                .unwrap();
        assert_eq!(message.to, vec!["a@x.org", "b@y.org"]);
        assert_eq!(message.cc, vec!["c@z.org"]);
        assert_eq!(message.subject, "Hello there");
        assert_eq!(message.body, "Line\ntwo");
    }

    #[test]
    fn rejects_other_schemes() {
        assert!(parse("https://example.org").is_none());
    }

    #[test]
    fn strips_header_injection_from_subjects() {
        let message = parse("mailto:a@x.org?subject=Hi%0D%0ABcc:%20evil@x.org").unwrap();
        assert!(!message.subject.contains('\n'));
        assert!(message.bcc.is_empty());
    }
}
