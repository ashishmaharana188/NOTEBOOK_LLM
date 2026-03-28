import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import model_runtime


class FakeSentenceTransformer:
    def __init__(self, model_id, device="cpu"):
        self.model_id = model_id
        self.device = device
        self.half_called = False
        self.bfloat16_called = False

    def half(self):
        self.half_called = True
        return self

    def bfloat16(self):
        self.bfloat16_called = True
        return self

    def encode(self, texts, **kwargs):
        if len(texts) == 1:
            return [[0.25] * model_runtime.EMBEDDING_STORAGE_DIM]
        return [[0.25] * model_runtime.EMBEDDING_STORAGE_DIM for _ in texts]


class ModelRuntimeManagerTests(unittest.TestCase):
    def make_manager(self, env=None):
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        config_path = Path(temp_dir.name) / "system_runtime_config.json"
        manager = model_runtime.ModelRuntimeManager(
            env=env or {},
            data_dir=temp_dir.name,
            config_path=str(config_path),
            start_sweeper=False,
        )
        self.addCleanup(manager.shutdown)
        return manager

    def test_default_startup_preserves_cloud_cpu_preset(self):
        manager = self.make_manager()

        self.assertEqual(
            manager.get_runtime_snapshot()["config"]["runtime_preset"],
            model_runtime.RUNTIME_PRESET_CLOUD_CPU,
        )
        self.assertEqual(manager.get_runtime_snapshot()["config"]["embedding_profile"], "all-minilm-l6-v2")
        self.assertEqual(manager.get_runtime_snapshot()["config"]["reasoning_profile"], "qwen2.5:0.5b-instruct")
        self.assertFalse(manager.get_runtime_snapshot()["config"]["embedding_eager_unload"])

    def test_local_cuda_env_preset_applies_local_defaults(self):
        manager = self.make_manager(
            env={
                model_runtime.ENV_RUNTIME_PRESET: model_runtime.RUNTIME_PRESET_LOCAL_CUDA_TEST,
                model_runtime.ENV_LOCAL_REASONING_OLLAMA_TAG: "phi3.5-mini-q4-test",
            }
        )

        snapshot = manager.get_runtime_snapshot()
        config = snapshot["config"]
        self.assertEqual(config["runtime_preset"], model_runtime.RUNTIME_PRESET_LOCAL_CUDA_TEST)
        self.assertEqual(config["embedding_profile"], "bge-m3")
        self.assertEqual(config["reasoning_profile"], "phi3.5-local-q4")
        self.assertEqual(config["embedding_placement"], "cuda")
        self.assertEqual(config["reasoning_placement"], "cuda")
        self.assertEqual(config["embedding_precision"], "fp16")
        self.assertTrue(config["embedding_eager_unload"])
        self.assertEqual(snapshot["resolved"]["reasoning_model_tag"], "phi3.5-mini-q4-test")

    def test_local_cuda_startup_requires_reasoning_tag_env(self):
        with self.assertRaises(model_runtime.RuntimeLoadError) as error:
            self.make_manager(
                env={
                    model_runtime.ENV_RUNTIME_PRESET: model_runtime.RUNTIME_PRESET_LOCAL_CUDA_TEST,
                }
            )

        self.assertIn(model_runtime.ENV_LOCAL_REASONING_OLLAMA_TAG, str(error.exception))

    def test_embedding_eager_unload_runs_after_embedding_task(self):
        with mock.patch.object(
            model_runtime, "SentenceTransformer", FakeSentenceTransformer
        ), mock.patch.object(
            model_runtime.torch.cuda, "is_available", return_value=True
        ), mock.patch.object(model_runtime.torch.cuda, "empty_cache", return_value=None):
            manager = self.make_manager(
                env={
                    model_runtime.ENV_RUNTIME_PRESET: model_runtime.RUNTIME_PRESET_LOCAL_CUDA_TEST,
                    model_runtime.ENV_LOCAL_REASONING_OLLAMA_TAG: "phi3.5-mini-q4-test",
                }
            )
            manager.ensure_roles_loaded(["embedding"])
            self.assertTrue(manager.get_runtime_snapshot()["roles"]["embedding"]["loaded"])

            vector = manager.get_embedding("hello world")

            self.assertEqual(len(vector), model_runtime.EMBEDDING_STORAGE_DIM)
            self.assertFalse(manager.get_runtime_snapshot()["roles"]["embedding"]["loaded"])
            self.assertTrue(manager.get_runtime_snapshot()["roles"]["embedding"]["enabled"])

    def test_reasoning_load_unloads_active_embedding_first(self):
        with mock.patch.object(
            model_runtime, "SentenceTransformer", FakeSentenceTransformer
        ), mock.patch.object(
            model_runtime.torch.cuda, "is_available", return_value=True
        ), mock.patch.object(model_runtime.torch.cuda, "empty_cache", return_value=None):
            manager = self.make_manager(
                env={
                    model_runtime.ENV_RUNTIME_PRESET: model_runtime.RUNTIME_PRESET_LOCAL_CUDA_TEST,
                    model_runtime.ENV_LOCAL_REASONING_OLLAMA_TAG: "phi3.5-mini-q4-test",
                }
            )
            manager.ensure_roles_loaded(["embedding"])

            with mock.patch.object(manager, "_ollama_is_reachable", return_value=True), mock.patch.object(
                manager, "_resolve_ollama_model_name", side_effect=lambda model_name: model_name
            ), mock.patch.object(manager, "_ollama_generate", return_value={"response": "ok"}):
                manager.load_reasoning_model()

            snapshot = manager.get_runtime_snapshot()
            self.assertFalse(snapshot["roles"]["embedding"]["loaded"])
            self.assertTrue(snapshot["roles"]["reasoning"]["loaded"])


if __name__ == "__main__":
    unittest.main()
