use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};

const MAX_CLUSTER_ITEMS: usize = 120;

#[derive(Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Target {
    Codes,
    Documents,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Measure {
    Cosine,
    Jaccard,
    Dice,
}

#[derive(Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Linkage {
    #[default]
    Average,
    Complete,
}

#[derive(Deserialize)]
pub struct ContextUnit {
    #[serde(alias = "guid")]
    id: String,
    // The distinct codes assigned to each selection are counted once.
    selections: Vec<Vec<String>>,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SpanGeometry {
    Span {
        space: String,
        start: f64,
        end: f64,
    },
    Rect {
        page: u32,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    },
    Point {
        id: String,
    },
}

impl SpanGeometry {
    fn overlaps(&self, other: &Self) -> bool {
        match (self, other) {
            (
                Self::Rect {
                    page: p1,
                    x: x1,
                    y: y1,
                    width: w1,
                    height: h1,
                },
                Self::Rect {
                    page: p2,
                    x: x2,
                    y: y2,
                    width: w2,
                    height: h2,
                },
            ) => {
                p1 == p2
                    && x1.max(*x2) < (x1 + w1).min(x2 + w2)
                    && y1.max(*y2) < (y1 + h1).min(y2 + h2)
            }
            (
                Self::Span {
                    space: s1,
                    start: a1,
                    end: b1,
                },
                Self::Span {
                    space: s2,
                    start: a2,
                    end: b2,
                },
            ) => s1 == s2 && a1.max(*a2) < b1.min(*b2),
            (Self::Point { id: a }, Self::Point { id: b }) => a == b,
            _ => false,
        }
    }
}

#[derive(Deserialize)]
pub struct OverlapSelection {
    geometry: SpanGeometry,
    codes: Vec<String>,
}

#[derive(Deserialize)]
pub struct OverlapSource {
    guid: String,
    selections: Vec<OverlapSelection>,
}

fn default_min_references() -> u64 {
    1
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    #[serde(default, alias = "documents")]
    units: Vec<ContextUnit>,
    #[serde(default)]
    overlap_sources: Option<Vec<OverlapSource>>,
    codes: Vec<String>,
    target: Target,
    measure: Measure,
    #[serde(default)]
    linkage: Linkage,
    #[serde(default = "default_min_references")]
    min_references: u64,
}

type Profile = BTreeMap<String, u64>;

#[derive(Serialize)]
pub struct Item {
    guid: String,
    profile: Profile,
}

#[derive(Serialize)]
pub struct Node {
    id: usize,
    size: usize,
    height: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    left: Option<Box<Node>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    right: Option<Box<Node>>,
}

#[derive(Serialize)]
pub struct Result {
    items: Vec<Item>,
    excluded: Vec<String>,
    limited: bool,
    limit: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    similarities: Option<Vec<Vec<f64>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    root: Option<Node>,
    #[serde(rename = "groupsByCut", skip_serializing_if = "Option::is_none")]
    groups_by_cut: Option<Vec<Vec<usize>>>,
}

fn coding_profiles(request: &Request) -> Vec<Item> {
    let codes: HashSet<_> = request.codes.iter().map(String::as_str).collect();
    let guids: Vec<_> = match request.target {
        Target::Codes => request.codes.iter().map(String::as_str).collect(),
        Target::Documents => request.units.iter().map(|unit| unit.id.as_str()).collect(),
    };
    let mut items = Vec::with_capacity(guids.len());
    let mut index = HashMap::new();
    for guid in guids {
        if index.contains_key(guid) {
            continue;
        }
        index.insert(guid, items.len());
        items.push(Item {
            guid: guid.into(),
            profile: Profile::new(),
        });
    }

    let mut visited_units = HashSet::new();
    for unit in &request.units {
        if !visited_units.insert(unit.id.as_str()) {
            continue;
        }
        for selection in &unit.selections {
            let assigned: HashSet<_> = selection.iter().map(String::as_str).collect();
            for code in assigned {
                if !codes.contains(code) {
                    continue;
                }
                let (guid, feature) = match request.target {
                    Target::Codes => (code, unit.id.as_str()),
                    Target::Documents => (unit.id.as_str(), code),
                };
                let profile = &mut items[index[guid]].profile;
                if let Some(count) = profile.get_mut(feature) {
                    *count += 1;
                } else {
                    profile.insert(feature.to_owned(), 1);
                }
            }
        }
    }
    items
}

fn analyze_overlap(request: &Request, sources: &[OverlapSource], min_refs: u64) -> Result {
    let mut ordered_codes: Vec<&str> = Vec::with_capacity(request.codes.len());
    let mut counts: HashMap<&str, u64> = HashMap::new();
    for code in &request.codes {
        if !counts.contains_key(code.as_str()) {
            ordered_codes.push(code.as_str());
            counts.insert(code.as_str(), 0);
        }
    }

    let mut visited_sources = HashSet::new();
    for src in sources {
        if !visited_sources.insert(src.guid.as_str()) {
            continue;
        }
        for sel in &src.selections {
            let unique_codes: HashSet<&str> = sel.codes.iter().map(String::as_str).collect();
            for code in unique_codes {
                if let Some(total) = counts.get_mut(code) {
                    *total += 1;
                }
            }
        }
    }

    let mut items = Vec::new();
    let mut excluded = Vec::new();
    for code in ordered_codes {
        let total = counts[code];
        if total >= min_refs {
            items.push(Item {
                guid: code.to_owned(),
                profile: BTreeMap::from([(String::from("overlap"), total)]),
            });
        } else {
            excluded.push(code.to_owned());
        }
    }

    let mut result = Result {
        limited: items.len() > MAX_CLUSTER_ITEMS,
        items,
        excluded,
        limit: MAX_CLUSTER_ITEMS,
        similarities: None,
        root: None,
        groups_by_cut: None,
    };
    if result.limited {
        return result;
    }

    let active_index: HashMap<&str, usize> = result
        .items
        .iter()
        .enumerate()
        .map(|(idx, item)| (item.guid.as_str(), idx))
        .collect();
    let m = result.items.len();
    let mut directed = vec![vec![0_u64; m]; m];

    let mut visited_sources = HashSet::new();
    for src in sources {
        if !visited_sources.insert(src.guid.as_str()) {
            continue;
        }
        let sels: Vec<(&SpanGeometry, Vec<usize>)> = src
            .selections
            .iter()
            .map(|sel| {
                let mut indices: Vec<usize> = sel
                    .codes
                    .iter()
                    .filter_map(|c| active_index.get(c.as_str()).copied())
                    .collect();
                indices.sort_unstable();
                indices.dedup();
                (&sel.geometry, indices)
            })
            .collect();

        for (s_idx, (s_geom, s_codes)) in sels.iter().enumerate() {
            if s_codes.is_empty() {
                continue;
            }
            let mut touched: HashSet<usize> = s_codes.iter().copied().collect();
            for (t_idx, (t_geom, t_codes)) in sels.iter().enumerate() {
                if s_idx == t_idx || t_codes.is_empty() {
                    continue;
                }
                if s_geom.overlaps(t_geom) {
                    touched.extend(t_codes.iter().copied());
                }
            }
            for &a in s_codes {
                for &b in &touched {
                    if a != b {
                        directed[a][b] += 1;
                    }
                }
            }
        }
    }

    let mut matrix = vec![vec![0.0; m]; m];
    for i in 0..m {
        matrix[i][i] = 1.0;
        let n_i = result.items[i].profile["overlap"] as f64;
        for j in 0..i {
            let n_j = result.items[j].profile["overlap"] as f64;
            let a_ij = directed[i][j];
            let b_ij = directed[j][i];
            let sim = if a_ij > 0 && b_ij > 0 {
                match request.measure {
                    Measure::Cosine => ((a_ij as f64 * b_ij as f64).sqrt() / (n_i * n_j).sqrt())
                        .min(1.0),
                    Measure::Dice => ((a_ij + b_ij) as f64 / (n_i + n_j)).min(1.0),
                    Measure::Jaccard => {
                        let mean_shared = 0.5 * (a_ij + b_ij) as f64;
                        (mean_shared / (n_i + n_j - mean_shared)).min(1.0)
                    }
                }
            } else {
                0.0
            };
            matrix[i][j] = sim;
            matrix[j][i] = sim;
        }
    }

    result.root = agglomerate(&matrix, request.linkage);
    result.groups_by_cut = Some(result.root.as_ref().map(groups_by_cut).unwrap_or_default());
    result.similarities = Some(matrix);
    result
}

pub fn analyze(request: Request) -> Result {
    let min_refs = request.min_references.max(1);
    if request.target == Target::Codes
        && let Some(sources) = &request.overlap_sources
    {
        return analyze_overlap(&request, sources, min_refs);
    }

    let (items, empty): (Vec<_>, Vec<_>) = coding_profiles(&request)
        .into_iter()
        .partition(|item| item.profile.values().sum::<u64>() >= min_refs);
    let excluded = empty.into_iter().map(|item| item.guid).collect();
    let mut result = Result {
        limited: items.len() > MAX_CLUSTER_ITEMS,
        items,
        excluded,
        limit: MAX_CLUSTER_ITEMS,
        similarities: None,
        root: None,
        groups_by_cut: None,
    };
    if !result.limited {
        let similarities = similarities(&result.items, request.measure);
        result.root = agglomerate(&similarities, request.linkage);
        result.groups_by_cut = Some(result.root.as_ref().map(groups_by_cut).unwrap_or_default());
        result.similarities = Some(similarities);
    }
    result
}

fn similarities(items: &[Item], measure: Measure) -> Vec<Vec<f64>> {
    let norms: Vec<_> = items
        .iter()
        .map(|item| {
            item.profile
                .values()
                .map(|&count| (count as f64).powi(2))
                .sum::<f64>()
                .sqrt()
        })
        .collect();
    let mut matrix = vec![vec![0.0; items.len()]; items.len()];
    for (i, first) in items.iter().enumerate() {
        matrix[i][i] = 1.0;
        for (j, second) in items[..i].iter().enumerate() {
            let (small, large) = if first.profile.len() <= second.profile.len() {
                (&first.profile, &second.profile)
            } else {
                (&second.profile, &first.profile)
            };
            let (mut common, mut dot) = (0, 0.0);
            for (feature, &count) in small {
                if let Some(&other) = large.get(feature) {
                    common += 1;
                    dot += count as f64 * other as f64;
                }
            }
            let size = small.len() + large.len();
            let similarity = match measure {
                Measure::Cosine => (dot / (norms[i] * norms[j])).min(1.0),
                Measure::Jaccard => common as f64 / (size - common) as f64,
                Measure::Dice => (2 * common) as f64 / size as f64,
            };
            matrix[i][j] = similarity;
            matrix[j][i] = similarity;
        }
    }
    matrix
}

fn agglomerate(similarities: &[Vec<f64>], linkage: Linkage) -> Option<Node> {
    let n = similarities.len();
    let mut distances: Vec<Vec<_>> = similarities
        .iter()
        .map(|row| row.iter().map(|value| 1.0 - value).collect())
        .collect();
    let mut active: Vec<_> = (0..n)
        .map(|id| {
            Some(Node {
                id,
                size: 1,
                height: 0.0,
                left: None,
                right: None,
            })
        })
        .collect();
    for id in n..n.saturating_mul(2).saturating_sub(1) {
        let (mut a, mut b, mut height) = (0, 0, f64::INFINITY);
        for i in 0..n {
            if active[i].is_none() {
                continue;
            }
            for j in i + 1..n {
                if active[j].is_some() && distances[i][j] < height {
                    (a, b, height) = (i, j, distances[i][j]);
                }
            }
        }
        let left = active[a].take().expect("a selected group is active");
        let right = active[b].take().expect("a selected group is active");
        let size = left.size + right.size;
        for (i, node) in active.iter().enumerate() {
            if node.is_none() {
                continue;
            }
            let distance = match linkage {
                Linkage::Average => {
                    (left.size as f64 * distances[a][i] + right.size as f64 * distances[b][i])
                        / size as f64
                }
                Linkage::Complete => distances[a][i].max(distances[b][i]),
            };
            distances[a][i] = distance;
            distances[i][a] = distance;
        }
        active[a] = Some(Node {
            id,
            size,
            height,
            left: Some(Box::new(left)),
            right: Some(Box::new(right)),
        });
    }
    active.into_iter().flatten().next()
}

/// The partition at every cut, indexed by the number of groups minus one.
fn groups_by_cut(root: &Node) -> Vec<Vec<usize>> {
    fn assign(node: &Node, group: usize, labels: &mut [usize]) {
        if let (Some(left), Some(right)) = (&node.left, &node.right) {
            assign(left, group, labels);
            assign(right, group, labels);
        } else {
            labels[node.id] = group;
        }
    }

    let mut groups = vec![root];
    let mut cuts = Vec::with_capacity(root.size);
    loop {
        let mut labels = vec![0; root.size];
        for (group, node) in groups.iter().enumerate() {
            assign(node, group + 1, &mut labels);
        }
        cuts.push(labels);
        if groups.len() == root.size {
            break;
        }
        // Reverse merge order also defines the cuts when heights tie.
        let i = groups
            .iter()
            .enumerate()
            .max_by_key(|(_, node)| node.id)
            .unwrap()
            .0;
        let node = groups.remove(i);
        groups.insert(i, node.right.as_deref().unwrap());
        groups.insert(i, node.left.as_deref().unwrap());
    }
    cuts
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unit(id: &str, selections: &[&[&str]]) -> ContextUnit {
        ContextUnit {
            id: id.into(),
            selections: selections
                .iter()
                .map(|codes| codes.iter().map(|code| (*code).into()).collect())
                .collect(),
        }
    }

    fn fixture(target: Target, measure: Measure) -> Request {
        Request {
            units: vec![
                unit("a", &[&["x", "x"], &["x"], &["y"]]),
                unit("b", &[&["y"]]),
                unit("c", &[&["z"]]),
                unit("d", &[]),
            ],
            overlap_sources: None,
            codes: ["x", "y", "z", "parent"].map(String::from).to_vec(),
            target,
            measure,
            linkage: Linkage::Average,
            min_references: 1,
        }
    }

    fn close(actual: f64, expected: f64) {
        assert!((actual - expected).abs() < 1e-12, "{actual} != {expected}");
    }

    #[test]
    fn counts_direct_codings_once_and_transposes_by_target() {
        let docs = coding_profiles(&fixture(Target::Documents, Measure::Cosine));
        assert_eq!(
            docs[0].profile,
            BTreeMap::from([("x".into(), 2), ("y".into(), 1)])
        );
        assert!(docs[3].profile.is_empty());

        let codes = coding_profiles(&fixture(Target::Codes, Measure::Cosine));
        assert_eq!(codes[0].profile, BTreeMap::from([("a".into(), 2)]));
        assert_eq!(
            codes[1].profile,
            BTreeMap::from([("a".into(), 1), ("b".into(), 1)])
        );
        assert!(codes[3].profile.is_empty());
    }

    #[test]
    fn matches_reference_measures_and_excludes_sparse_profiles() {
        for (measure, expected) in [
            (Measure::Cosine, 1.0 / 5.0_f64.sqrt()),
            (Measure::Jaccard, 0.5),
            (Measure::Dice, 2.0 / 3.0),
        ] {
            let result = analyze(fixture(Target::Documents, measure));
            assert_eq!(result.excluded, ["d"]);
            let matrix = result.similarities.unwrap();
            close(matrix[0][1], expected);
            close(matrix[1][0], expected);
            assert_eq!(matrix[0][2], 0.0);
            assert_eq!(matrix[0][0], 1.0);
            let root = result.root.unwrap();
            close(root.height, 1.0);
            assert_eq!(root.left.unwrap().size, 2);
        }

        let mut stricter = fixture(Target::Documents, Measure::Cosine);
        stricter.min_references = 2;
        let stricter_result = analyze(stricter);
        assert_eq!(stricter_result.excluded, ["b", "c", "d"]);
        assert_eq!(stricter_result.items.len(), 1);
    }

    #[test]
    fn bounds_spatial_overlap_similarity_when_many_spans_nest_inside_one() {
        for measure in [Measure::Cosine, Measure::Jaccard, Measure::Dice] {
            let request = Request {
                units: Vec::new(),
                overlap_sources: Some(vec![OverlapSource {
                    guid: "doc1".into(),
                    selections: vec![
                        OverlapSelection {
                            geometry: SpanGeometry::Span {
                                space: "text".into(),
                                start: 0.0,
                                end: 100.0,
                            },
                            codes: vec!["broad".into()],
                        },
                        OverlapSelection {
                            geometry: SpanGeometry::Span {
                                space: "text".into(),
                                start: 10.0,
                                end: 20.0,
                            },
                            codes: vec!["narrow".into()],
                        },
                        OverlapSelection {
                            geometry: SpanGeometry::Span {
                                space: "text".into(),
                                start: 30.0,
                                end: 40.0,
                            },
                            codes: vec!["narrow".into()],
                        },
                        OverlapSelection {
                            geometry: SpanGeometry::Span {
                                space: "text".into(),
                                start: 50.0,
                                end: 60.0,
                            },
                            codes: vec!["narrow".into()],
                        },
                    ],
                }]),
                codes: vec!["broad".into(), "narrow".into()],
                target: Target::Codes,
                measure,
                linkage: Linkage::Average,
                min_references: 1,
            };
            let result = analyze(request);
            let matrix = result.similarities.unwrap();
            close(matrix[0][1], 1.0);
            close(result.root.unwrap().height, 0.0);
        }
    }

    #[test]
    fn average_linkage_weights_each_leaf_equally() {
        let request = Request {
            units: vec![
                unit("a", &[&["x", "y"]]),
                unit("b", &[&["x", "y"]]),
                unit("c", &[&["x"]]),
                unit("d", &[&["x", "z"]]),
            ],
            overlap_sources: None,
            codes: ["x", "y", "z"].map(String::from).to_vec(),
            target: Target::Documents,
            measure: Measure::Jaccard,
            linkage: Linkage::Average,
            min_references: 1,
        };
        let result = analyze(request);
        assert_eq!(
            result.groups_by_cut.unwrap(),
            [
                vec![1, 1, 1, 1],
                vec![1, 1, 1, 2],
                vec![1, 1, 2, 3],
                vec![1, 2, 3, 4]
            ]
        );
        let root = result.root.unwrap();
        close(root.height, (2.0 / 3.0 + 2.0 / 3.0 + 0.5) / 3.0);
        assert_eq!(root.left.unwrap().size, 3);
    }

    #[test]
    #[ignore = "requires Rscript on PATH or in RSCRIPT"]
    fn matches_base_r() {
        use std::io::Write;
        use std::process::{Command, Stdio};

        let script_path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/clustering-reference.R");
        let mut child =
            Command::new(std::env::var_os("RSCRIPT").unwrap_or_else(|| "Rscript".into()))
                .args(["--vanilla", script_path])
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .spawn()
                .expect("start Rscript");
        let mut stdin = child.stdin.take().unwrap();
        let items: Vec<_> = (0..24)
            .map(|i| {
                let mut profile = Profile::new();
                for j in 0..30 {
                    let count = if (i * 17 + j * 37 + i * j * 13) % 53 < 19 {
                        0
                    } else {
                        (i * 41 + j * 31 + i * j) % 17 + 1
                    };
                    write!(stdin, "{count} ").unwrap();
                    if count > 0 {
                        profile.insert(j.to_string(), count);
                    }
                }
                writeln!(stdin).unwrap();
                Item {
                    guid: i.to_string(),
                    profile,
                }
            })
            .collect();
        drop(stdin);
        let output = child.wait_with_output().unwrap();
        assert!(output.status.success());
        let output = String::from_utf8(output.stdout).unwrap();
        let mut rows = output.lines().map(|line| {
            line.split_whitespace()
                .map(|value| value.parse::<f64>().unwrap())
                .collect::<Vec<_>>()
        });

        let matrices = [Measure::Cosine, Measure::Jaccard, Measure::Dice].map(|measure| {
            let matrix = similarities(&items, measure);
            let expected = rows.next().unwrap();
            assert_eq!(expected.len(), items.len() * items.len());
            for (actual, expected) in matrix.iter().flatten().zip(expected) {
                close(*actual, expected);
            }
            matrix
        });

        fn visit(node: &Node, heights: &mut Vec<f64>) {
            if let (Some(left), Some(right)) = (&node.left, &node.right) {
                visit(left, heights);
                visit(right, heights);
                heights.push(node.height);
            }
        }

        for linkage in [Linkage::Average, Linkage::Complete] {
            let root = agglomerate(&matrices[0], linkage).unwrap();
            let mut heights = Vec::new();
            visit(&root, &mut heights);
            heights.sort_by(f64::total_cmp);
            let expected = rows.next().unwrap();
            assert_eq!(expected.len(), heights.len());
            for (actual, expected) in heights.into_iter().zip(expected) {
                close(actual, expected);
            }

            let cuts = groups_by_cut(&root);
            let labels = &cuts[4];
            let expected = rows.next().unwrap();
            assert_eq!(expected.len(), labels.len());
            for i in 0..labels.len() {
                for j in 0..i {
                    assert_eq!(
                        labels[i] == labels[j],
                        expected[i] == expected[j],
                        "pair ({i}, {j})"
                    );
                }
            }
        }
    }

    #[test]
    fn handles_empty_input_and_bounds_the_pairwise_calculation() {
        let mut request = fixture(Target::Documents, Measure::Cosine);
        request.codes.clear();
        let result = analyze(request);
        assert!(result.root.is_none());
        assert!(result.similarities.unwrap().is_empty());

        let mut request = fixture(Target::Documents, Measure::Cosine);
        request.units = (0..=MAX_CLUSTER_ITEMS)
            .map(|i| unit(&i.to_string(), &[&["x"]]))
            .collect();
        let result = analyze(request);
        assert!(result.limited);
        assert!(result.similarities.is_none());
    }
}
