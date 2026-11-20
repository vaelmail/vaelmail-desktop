use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use sha2::{Digest, Sha256};

const DEADLINE: Duration = Duration::from_secs(90);
const WORKERS: usize = 4;
const CHECK_INTERVAL: u32 = 1 << 16;

#[derive(Debug, Clone)]
pub struct Puzzle {
    pub seed: String,
    pub difficulty: u32,
    pub count: u32,
}

fn leading_zero_bits(digest: &[u8], difficulty: u32) -> bool {
    if difficulty == 0 {
        return true;
    }
    let head = u32::from_be_bytes([digest[0], digest[1], digest[2], digest[3]]);
    let shift = 32u32.saturating_sub(difficulty.min(32));
    head >> shift == 0
}

fn solve_one(prefix: &[u8], difficulty: u32, cancel: &AtomicBool, started: Instant) -> Option<u32> {
    let mut base = Sha256::new();
    base.update(prefix);
    for nonce in 0..=u32::MAX {
        if nonce % CHECK_INTERVAL == 0
            && (cancel.load(Ordering::Relaxed) || started.elapsed() > DEADLINE)
        {
            return None;
        }
        let mut hasher = base.clone();
        hasher.update(nonce.to_be_bytes());
        if leading_zero_bits(&hasher.finalize(), difficulty) {
            return Some(nonce);
        }
    }
    None
}

pub fn solve(puzzle: &Puzzle) -> Option<Vec<u32>> {
    let started = Instant::now();
    let cancel = AtomicBool::new(false);
    let jobs: Vec<u32> = (0..puzzle.count).collect();
    let workers = WORKERS.min(jobs.len().max(1));
    let mut results: Vec<Option<u32>> = vec![None; jobs.len()];

    std::thread::scope(|scope| {
        let mut handles = Vec::new();
        for worker in 0..workers {
            let cancel = &cancel;
            let jobs = &jobs;
            let puzzle = &puzzle;
            handles.push(scope.spawn(move || {
                let mut found = Vec::new();
                for index in (worker..jobs.len()).step_by(workers) {
                    let mut prefix: Vec<u8> = puzzle.seed.chars().map(|c| c as u8).collect();
                    prefix.push(jobs[index] as u8);
                    match solve_one(&prefix, puzzle.difficulty, cancel, started) {
                        Some(nonce) => found.push((index, nonce)),
                        None => {
                            cancel.store(true, Ordering::Relaxed);
                            break;
                        }
                    }
                }
                found
            }));
        }
        for handle in handles {
            for (index, nonce) in handle.join().unwrap_or_default() {
                results[index] = Some(nonce);
            }
        }
    });

    results.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn satisfies(seed: &str, index: u8, nonce: u32, difficulty: u32) -> bool {
        let mut hasher = Sha256::new();
        hasher.update(seed.as_bytes());
        hasher.update([index]);
        hasher.update(nonce.to_be_bytes());
        leading_zero_bits(&hasher.finalize(), difficulty)
    }

    #[test]
    fn solutions_meet_the_difficulty() {
        let puzzle = Puzzle {
            seed: "abcd1234".into(),
            difficulty: 12,
            count: 3,
        };
        let nonces = solve(&puzzle).expect("puzzle is solvable");
        assert_eq!(nonces.len(), 3);
        for (index, nonce) in nonces.iter().enumerate() {
            assert!(satisfies(&puzzle.seed, index as u8, *nonce, 12));
        }
    }

    #[test]
    fn zero_difficulty_is_trivial() {
        let puzzle = Puzzle {
            seed: "seed".into(),
            difficulty: 0,
            count: 2,
        };
        assert_eq!(solve(&puzzle), Some(vec![0, 0]));
    }
}
