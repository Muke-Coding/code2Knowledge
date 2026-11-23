package com.code2knowledge.identity;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.Set;
import java.util.TreeSet;
import java.util.Arrays;

/** 历史集成场景的显式授权输入适配；只在测试中展开旧场景动作，生产接口拒绝旧manage码，新权限矩阵不使用此适配。 */
final class TestPermissions {
    /** 禁止实例化纯测试输入工具。 */
    private TestPermissions() { }
    /**
     * 将历史测试场景展开成新动作与读取前置，不给生产授权保留别名后门。
     * @param codes 原测试场景明确需要的动作，可为空
     * @return 细分且依赖完整的权限输入
     * @throws Exception 源目录缺失或解析失败
     */
    static java.util.List<String> expand(String... codes) throws Exception {
        JsonNode catalog;
        try (InputStream input = TestPermissions.class.getResourceAsStream("/permission-catalog.json")) { catalog = new ObjectMapper().readTree(input); }
        Set<String> result = new TreeSet<>();
        for (String code : codes) { JsonNode legacy = catalog.path("legacy").path(code); if (legacy.isArray()) for (JsonNode value : legacy) result.add(value.asText()); else result.add(code); }
        if (Arrays.asList(codes).contains("source.analyze")) { result.add("device.read"); result.add("device.pair"); result.add("device.revoke"); }
        boolean changed = true;
        while (changed) { changed = false; for (String code : result.toArray(new String[0])) for (JsonNode dependency : catalog.path("dependencies").path(code)) if (result.add(dependency.asText())) changed = true; }
        return new java.util.ArrayList<>(result);
    }
}
