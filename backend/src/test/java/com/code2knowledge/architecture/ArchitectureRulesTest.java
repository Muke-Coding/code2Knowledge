package com.code2knowledge.architecture;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.CallableDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.FieldAccessExpr;
import com.github.javaparser.ast.expr.NameExpr;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.type.Type;
import java.util.Map;
import java.util.HashMap;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.xml.sax.InputSource;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 当前仓库架构门禁：源代码分层、SQL 存放、XML 对应与中文说明；不是完整手册认证。
 * 使用源 AST 而非类名后缀猜测依赖，以检查显式全限定类型和注解。
 */
class ArchitectureRulesTest {

    /** 禁止在 Java 注解中编写业务 SQL，包括各类 Provider。 */
    private static final Set<String> SQL_ANNOTATIONS = new HashSet<>(Arrays.asList(
            "Select", "Insert", "Update", "Delete", "SelectKey", "SelectProvider",
            "InsertProvider", "UpdateProvider", "DeleteProvider"));

    /** 允许手写业务类型所属职责包，不允许业务类散落领域根包。 */
    private static final Pattern PACKAGE_RULE = Pattern.compile(
            "com\\.code2knowledge\\.[a-z][a-z0-9]*\\.(controller|service|mapper|config|constant|exception|security|domain\\.(entity|dto|bo|vo)|response|handler|persistence\\.typehandler)(\\.[a-z][a-z0-9]*)*");

    /** XML 业务映射语句，块之间必须有真正空行。 */
    private static final Pattern XML_BLOCK = Pattern.compile(
            "<(select|insert|update|delete|resultMap|sql)\\b[^>]*(?:/>|>.*?</\\1>)", Pattern.DOTALL);

    /** 测试专用临时工程目录，隔离 Mapper 样例，不向业务源码写入假接口。 */
    @TempDir
    private Path fixtureRoot;

    /**
     * 检查所有主代码的职责依赖、禁止 SQL 注解与 Mapper/XML 对应，并检查测试及主代码说明。
     *
     * @throws Exception 源文件、XML 无法读取或解析时抛出，不能静默跳过门禁
     */
    @Test
    void repositorySatisfiesArchitectureAndDocumentationRules() throws Exception {
        List<String> errors = new ArrayList<>();
        for (Path source : javaSources(Paths.get("src"))) {
            boolean production = source.startsWith(Paths.get("src/main/java"));
            errors.addAll(validateJava(Files.readString(source), production));
        }
        Path xmlRoot = Paths.get("src/main/resources/mapper");
        if (Files.exists(xmlRoot)) {
            try (Stream<Path> files = Files.walk(xmlRoot)) {
                for (Path xml : files.filter(path -> path.toString().endsWith("Mapper.xml")).collect(Collectors.toList())) {
                    errors.addAll(validateXml(xml, Files.readString(xml)));
                }
            }
        }
        assertTrue(errors.isEmpty(), String.join("\n", errors));
    }

    /**
     * 用违规合成源码验证门禁真实拒绝 SQL 注解、错包和控制器直接依赖 Mapper。
     */
    @Test
    void syntheticViolationsAreRejected() {
        String source = "package com.code2knowledge.orders; import org.apache.ibatis.annotations.Select; "
                + "class OrderController { @Select(\"select 1\") String find(){return null;} }";
        List<String> errors = validateJava(source, true);
        assertTrue(errors.stream().anyMatch(error -> error.contains("职责包")));
        assertTrue(errors.stream().anyMatch(error -> error.contains("SQL 注解")));
        assertTrue(errors.stream().anyMatch(error -> error.contains("中文说明")));
        String controller = "package com.code2knowledge.orders.controller; "
                + "/** 订单控制器，不能越层。 */ class OrderController { "
                + "com.code2knowledge.orders.mapper.OrderMapper mapper; }";
        assertTrue(validateJava(controller, true).stream().anyMatch(error -> error.contains("Controller")));
    }

    /**
     * 验证说明文字和日志字符串不算依赖，但真实全限定类型、静态 SQL 调用与嵌套 DTO 被拒绝。
     */
    @Test
    void dependencyRulesIgnoreDocumentationAndRejectNestedDtos() {
        String legal = "package com.code2knowledge.orders.controller; "
                + "/** 订单控制器，说明 com.code2knowledge.orders.mapper.OrderMapper 不可直接使用。 */ "
                + "class OrderController { /** 示例文本，不执行 SQL。 */ "
                + "private String note = \"com.code2knowledge.orders.domain.entity.OrderDO java.sql.DriverManager JdbcTemplate SqlSession\"; }";
        assertTrue(validateJava(legal, true).isEmpty());
        String nested = "package com.code2knowledge.orders.controller; "
                + "/** 订单控制器，仅供违规测试。 */ class OrderController { "
                + "/** 请求数据，禁止内嵌。 */ static class RequestDTO {} }";
        assertTrue(validateJava(nested, true).stream().anyMatch(error -> error.contains("内禁止嵌套 DTO/VO")));
        String directSql = "package com.code2knowledge.orders.service; "
                + "/** 违规服务，直接访问 JDBC。 */ class OrderService { "
                + "/** 检查静态调用。 */ void call() { java.sql.DriverManager.getDrivers(); } }";
        assertTrue(validateJava(directSql, true).stream().anyMatch(error -> error.contains("不得绕过 Mapper")));
    }

    /**
     * 用合成 XML 验证块空行、映射方法和返回类型问题可被发现，避免空 Mapper 目录假通过。
     *
     * @throws Exception XML 解析失败时抛出
     */
    @Test
    void syntheticXmlViolationsAreRejected() throws Exception {
        String xml = "<mapper namespace=\"com.code2knowledge.missing.mapper.MissingMapper\">"
                + "<select id=\"one\" resultType=\"java.lang.String\">SELECT 1</select>"
                + "<select id=\"two\" resultType=\"java.lang.String\">SELECT 2</select></mapper>";
        List<String> errors = validateXml(Paths.get("src/main/resources/mapper/missing/MissingMapper.xml"), xml);
        assertTrue(errors.stream().anyMatch(error -> error.contains("空行")));
        assertTrue(errors.stream().anyMatch(error -> error.contains("接口不存在")));
    }

    /**
     * 验证 Mapper 子包也要求 XML，且有效集合返回映射通过、错误返回和嵌套类型被拒绝。
     *
     * @throws Exception 临时工程写入或映射解析失败时抛出
     */
    @Test
    void nestedMapperAndReturnTypesAreValidated() throws Exception {
        String source = "package com.code2knowledge.orders.mapper.read; import java.util.List; "
                + "/** 只读订单样例接口，属于测试工程。 */ interface OrderMapper { "
                + "/** 查名称。 @return 名称列表，不为空 */ List<String> names(); }";
        Path java = fixtureRoot.resolve("src/main/java/com/code2knowledge/orders/mapper/read/OrderMapper.java");
        Files.createDirectories(java.getParent());
        Files.writeString(java, source);
        assertTrue(validateJava(source, true, fixtureRoot).stream().anyMatch(error -> error.contains("缺对应 Mapper XML")));
        Path relative = Paths.get("src/main/resources/mapper/orders/OrderMapper.xml");
        Path xmlPath = fixtureRoot.resolve(relative);
        Files.createDirectories(xmlPath.getParent());
        String valid = "<mapper namespace=\"com.code2knowledge.orders.mapper.read.OrderMapper\">"
                + "<select id=\"names\" resultType=\"string\">SELECT name FROM fixture</select></mapper>";
        Files.writeString(xmlPath, valid);
        assertTrue(validateJava(source, true, fixtureRoot).isEmpty());
        assertTrue(validateXml(relative, valid, fixtureRoot).isEmpty());
        assertTrue(validateXml(relative, valid.replace("resultType=\"string\"", "resultType=\"java.lang.Long\""), fixtureRoot)
                .stream().anyMatch(error -> error.contains("返回类型不一致")));
        String nested = "<mapper namespace=\"com.code2knowledge.orders.mapper.read.OrderMapper\">"
                + "<resultMap id=\"namesMap\" type=\"java.lang.String\">"
                + "<association property=\"missing\" javaType=\"com.code2knowledge.orders.domain.entity.MissingDO\"/>"
                + "</resultMap>\n\n<select id=\"names\" resultMap=\"namesMap\">SELECT name FROM fixture</select></mapper>";
        assertTrue(validateXml(relative, nested, fixtureRoot).stream().anyMatch(error -> error.contains("映射类型不存在")));
        assertTrue(validateXml(relative, nested.replace("com.code2knowledge.orders.domain.entity.MissingDO", "java.lang.String"), fixtureRoot).isEmpty());
    }

    /**
     * 遍历仓库 Java 源；测试生成目录不在 src 下，不能误将依赖当作手写源检查。
     *
     * @param root 源根目录，不为空且必须存在
     * @return Java 文件路径集合，不为空，可能无元素
     * @throws Exception 文件树不可读时抛出
     */
    private static List<Path> javaSources(Path root) throws Exception {
        try (Stream<Path> files = Files.walk(root)) {
            return files.filter(path -> path.toString().endsWith(".java")).collect(Collectors.toList());
        }
    }

    /**
     * 解析手写源并验证依赖、说明和 Mapper 文件约束，不执行 Java 代码。
     *
     * @param source Java 源文本，不允许为空
     * @param production 是否生产源；测试仍须中文说明但可不在业务职责包
     * @return 违规消息集合，空集合表示通过本检查而非业务验收通过
     */
    private static List<String> validateJava(String source, boolean production) {
        return validateJava(source, production, Paths.get("."));
    }

    /**
     * 在指定工程根下检查源码，供真实仓库与隔离样例复用同一规则。
     *
     * @param source Java 文本，不允许为空
     * @param production 是否适用生产分层约束
     * @param projectRoot 工程根目录，不允许为空
     * @return 违规消息列表，空表示本规则通过
     */
    private static List<String> validateJava(String source, boolean production, Path projectRoot) {
        CompilationUnit unit = StaticJavaParser.parse(source);
        List<String> errors = new ArrayList<>();
        String pkg = unit.getPackageDeclaration().map(value -> value.getNameAsString()).orElse("");
        if (production && !PACKAGE_RULE.matcher(pkg).matches()) {
            errors.add(pkg + "：类型必须归属职责包");
        }
        for (TypeDeclaration<?> type : unit.findAll(TypeDeclaration.class)) {
            requireChineseDoc(type.getJavadocComment().map(Object::toString).orElse(""), type.getNameAsString(), errors);
        }
        for (CallableDeclaration<?> method : unit.findAll(CallableDeclaration.class)) {
            String doc = method.getJavadocComment().map(Object::toString).orElse("");
            requireChineseDoc(doc, method.getNameAsString(), errors);
            method.getParameters().forEach(parameter -> {
                if (!doc.contains("@param " + parameter.getNameAsString())) {
                    errors.add(method.getNameAsString() + "：缺参数文档 " + parameter.getNameAsString());
                }
            });
            if (method.isMethodDeclaration() && !method.asMethodDeclaration().getType().isVoidType() && !doc.contains("@return")) {
                errors.add(method.getNameAsString() + "：缺返回文档");
            }
            if (!method.getThrownExceptions().isEmpty() && !doc.contains("@throws")) {
                errors.add(method.getNameAsString() + "：缺异常文档");
            }
        }
        for (FieldDeclaration field : unit.findAll(FieldDeclaration.class)) {
            requireChineseDoc(field.getJavadocComment().map(Object::toString).orElse(""), field.toString(), errors);
        }
        for (AnnotationExpr annotation : unit.findAll(AnnotationExpr.class)) {
            String name = annotation.getName().getIdentifier();
            if (SQL_ANNOTATIONS.contains(name)) {
                errors.add(pkg + "：禁止 SQL 注解 " + name);
            }
        }
        if (production) {
            Set<String> dependencies = dependencyNames(unit);
            if (pkg.contains(".controller") && dependencies.stream().anyMatch(name -> name.contains(".mapper.") || name.contains(".domain.entity."))) {
                errors.add(pkg + "：Controller 不得直接依赖 Mapper/DO");
            }
            if ((pkg.contains(".mapper") || pkg.contains(".domain."))
                    && dependencies.stream().anyMatch(name -> name.contains(".controller.") || name.contains(".service."))) {
                errors.add(pkg + "：Mapper/领域对象不得反向依赖服务/控制器");
            }
            if ((pkg.contains(".controller") || pkg.contains(".service"))
                    && dependencies.stream().anyMatch(name -> name.startsWith("java.sql.") || name.endsWith("JdbcTemplate") || name.endsWith("SqlSession"))) {
                errors.add(pkg + "：Controller/Service 不得绕过 Mapper 执行业务 SQL");
            }
            if (pkg.contains(".controller")) {
                for (TypeDeclaration<?> type : unit.findAll(TypeDeclaration.class)) {
                    String name = type.getNameAsString().toUpperCase(java.util.Locale.ROOT);
                    if (!unit.getTypes().contains(type) && (name.endsWith("DTO") || name.endsWith("VO"))) {
                        errors.add(pkg + "：Controller 内禁止嵌套 DTO/VO " + type.getNameAsString());
                    }
                }
            }
            for (String role : Arrays.asList("entity", "dto", "bo", "vo")) {
                if (pkg.contains(".domain." + role)) {
                    String suffix = "entity".equals(role) ? "DO" : role.toUpperCase(java.util.Locale.ROOT);
                    unit.getTypes().forEach(type -> {
                        if (!type.getNameAsString().endsWith(suffix)) {
                            errors.add(type.getNameAsString() + "：领域对象缺少职责后缀 " + suffix);
                        }
                    });
                }
            }
            if (pkg.matches(".*\\.mapper(?:\\..*)?")) {
                unit.getTypes().forEach(type -> {
                    Path xml = projectRoot.resolve(Paths.get("src/main/resources/mapper", pkg.split("\\.")[2], type.getNameAsString() + ".xml"));
                    if (!Files.isRegularFile(xml)) {
                        errors.add(type.getNameAsString() + "：缺对应 Mapper XML");
                    }
                });
            }
        }
        return errors;
    }

    /**
     * 从实际 import、类型、注解及成员访问表达式收集依赖，不扫描注释或字符串正文。
     * 静态全限定调用通过成员访问 AST 识别；这是显式源码依赖检查，不声称完成运行时符号解析。
     *
     * @param unit 已解析 Java 源，不允许为空
     * @return 去重依赖名，允许空集合，不为空
     */
    private static Set<String> dependencyNames(CompilationUnit unit) {
        Set<String> names = new HashSet<>();
        unit.getImports().forEach(imported -> names.add(imported.getNameAsString()
                + (imported.isAsterisk() ? ".*" : "")));
        unit.findAll(ClassOrInterfaceType.class).forEach(type -> names.add(type.getNameWithScope()));
        unit.findAll(AnnotationExpr.class).forEach(annotation -> names.add(annotation.getNameAsString()));
        unit.findAll(FieldAccessExpr.class).forEach(access -> {
            if (access.getScope() instanceof FieldAccessExpr || access.getScope() instanceof NameExpr) {
                names.add(access.toString());
            }
        });
        return names;
    }

    /**
     * 校验 XML 的安全解析、命名空间、方法对应、返回类型和块间格式；不访问外部 DTD。
     *
     * @param path 映射资源路径，非空，必须符合领域目录约定
     * @param source XML 内容，不允许为空
     * @return 违规消息，空表示当前检查通过
     * @throws Exception XML 不合法或源接口不可解析时抛出
     */
    private static List<String> validateXml(Path path, String source) throws Exception {
        return validateXml(path, source, Paths.get("."));
    }

    /**
     * 在指定工程根下校验映射；递归校验类型并比对 select 元素类型与 Java 返回值。
     *
     * @param path XML 相对资源路径，不允许为空
     * @param source XML 文本，不允许为空
     * @param projectRoot 工程根目录，不允许为空
     * @return 违规消息列表，空表示本规则通过
     * @throws Exception XML 或 Java 源不可解析时抛出
     */
    private static List<String> validateXml(Path path, String source, Path projectRoot) throws Exception {
        List<String> errors = new ArrayList<>();
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        // MyBatis XML 通常带 DTD；禁外部读取防止检查器解析不可信映射时联网或读取本机文件。
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        Document document = factory.newDocumentBuilder().parse(new InputSource(new StringReader(source)));
        Element mapper = document.getDocumentElement();
        String namespace = mapper.getAttribute("namespace");
        Path java = projectRoot.resolve(Paths.get("src/main/java", namespace.replace('.', '/') + ".java"));
        if (!Files.isRegularFile(java)) {
            errors.add(path + "：接口不存在 " + namespace);
        } else {
            CompilationUnit unit = StaticJavaParser.parse(java);
            Map<String, MethodDeclaration> declarations = new HashMap<>();
            for (MethodDeclaration method : unit.findAll(MethodDeclaration.class)) {
                if (declarations.put(method.getNameAsString(), method) != null) {
                    errors.add(path + "：Mapper 方法不可重载 " + method.getNameAsString());
                }
            }
            Set<String> methods = declarations.keySet();
            Set<String> statements = new HashSet<>();
            Map<String, String> resultTypes = new HashMap<>();
            NodeList allElements = mapper.getElementsByTagName("*");
            for (int i = 0; i < allElements.getLength(); i++) {
                Element element = (Element) allElements.item(i);
                if ("resultMap".equals(element.getTagName())) {
                    resultTypes.put(element.getAttribute("id"), element.getAttribute("type"));
                }
                // resultMap 的 association/collection 等嵌套节点也可能携带类型，不能只查直接子节点。
                for (String attribute : Arrays.asList("resultType", "parameterType", "type", "ofType", "javaType")) {
                    String value = element.getAttribute(attribute);
                    if (!value.isEmpty() && !typeExists(value, projectRoot)) {
                        errors.add(path + "：映射类型不存在 " + value);
                    }
                }
            }
            NodeList children = mapper.getChildNodes();
            for (int i = 0; i < children.getLength(); i++) {
                Node node = children.item(i);
                if (!(node instanceof Element)) {
                    continue;
                }
                Element element = (Element) node;
                if (Arrays.asList("select", "insert", "update", "delete").contains(element.getTagName())) {
                    String id = element.getAttribute("id");
                    statements.add(id);
                    if (!methods.contains(id)) {
                        errors.add(path + "：XML 语句无对应方法 " + id);
                    } else if ("select".equals(element.getTagName())) {
                        String mapped = element.getAttribute("resultType");
                        if (mapped.isEmpty()) {
                            mapped = resultTypes.get(element.getAttribute("resultMap"));
                        }
                        if (mapped == null || mapped.isEmpty()) {
                            errors.add(path + "：select 必须有可解析的 resultType/resultMap " + id);
                        } else {
                            String expectedType = returnElementType(declarations.get(id).getType(), unit);
                            if (!normalizeAlias(mapped).equals(expectedType)) {
                                errors.add(path + "：返回类型不一致 " + id + "，Java=" + expectedType + "，XML=" + mapped);
                            }
                        }
                    }
                }
            }
            if (!statements.equals(methods)) {
                errors.add(path + "：Mapper/XML 方法集合不一致");
            }
            String expected = "src/main/resources/mapper/" + namespace.split("\\.")[2] + "/" + java.getFileName().toString().replace(".java", ".xml");
            if (!path.toString().replace('\\', '/').equals(expected)) {
                errors.add(path + "：映射路径与 namespace 不一致");
            }
        }
        Matcher blocks = XML_BLOCK.matcher(source);
        int previousEnd = -1;
        while (blocks.find()) {
            if (previousEnd >= 0 && !source.substring(previousEnd, blocks.start()).matches("(?s).*\\R[\\t ]*\\R.*")) {
                errors.add(path + "：映射节点块之间缺少空行");
            }
            previousEnd = blocks.end();
        }
        return errors;
    }

    /**
     * 解析常见 MyBatis 内置别名；自定义类型要求全限定名，避免搬包后短名仍被误放行。
     *
     * @param value XML 类型值，不允许为空
     * @return 规范类型名，不为空；未知别名保留原值并由存在性检查拒绝
     */
    private static String normalizeAlias(String value) {
        Map<String, String> aliases = new HashMap<>();
        aliases.put("string", "java.lang.String");
        aliases.put("int", "java.lang.Integer");
        aliases.put("integer", "java.lang.Integer");
        aliases.put("long", "java.lang.Long");
        aliases.put("boolean", "java.lang.Boolean");
        aliases.put("double", "java.lang.Double");
        aliases.put("map", "java.util.Map");
        aliases.put("hashmap", "java.util.HashMap");
        return aliases.getOrDefault(value.toLowerCase(java.util.Locale.ROOT), value);
    }

    /**
     * 判断映射类型是否为真实 JDK 类或本工程源类型，不信任任意 java 前缀。
     *
     * @param value XML 类型，不允许为空
     * @param projectRoot 工程目录，不允许为空
     * @return 类型可定位时为真；不存在或未知别名为假
     */
    private static boolean typeExists(String value, Path projectRoot) {
        String name = normalizeAlias(value);
        if (projectRoot.resolve(Paths.get("src/main/java", name.replace('.', '/') + ".java")).toFile().isFile()) {
            return true;
        }
        try {
            Class.forName(name, false, ArchitectureRulesTest.class.getClassLoader());
            return true;
        } catch (ClassNotFoundException exception) {
            return false;
        }
    }

    /**
     * 取得 select 每行映射类型；集合、Optional 和数组使用元素类型，普通对象使用自身类型。
     *
     * @param type Java 方法返回类型，不允许为空
     * @param unit 所属 Java 源，用于解析 import，不允许为空
     * @return 全限定规范类型；未能静态解析时保留名称使比对失败，避免默许
     */
    private static String returnElementType(Type type, CompilationUnit unit) {
        if (type.isArrayType()) {
            return returnElementType(type.asArrayType().getComponentType(), unit);
        }
        String name = type.asString();
        if (type.isClassOrInterfaceType()) {
            com.github.javaparser.ast.type.ClassOrInterfaceType reference = type.asClassOrInterfaceType();
            String simple = reference.getNameAsString();
            if (Arrays.asList("List", "Collection", "Set", "Iterable", "Optional", "Cursor").contains(simple)
                    && reference.getTypeArguments().isPresent() && reference.getTypeArguments().get().size() == 1) {
                return returnElementType(reference.getTypeArguments().get().get(0), unit);
            }
            name = reference.getNameWithScope();
        }
        if (name.contains(".")) {
            return name;
        }
        for (com.github.javaparser.ast.ImportDeclaration imported : unit.getImports()) {
            if (!imported.isAsterisk() && imported.getName().getIdentifier().equals(name)) {
                return imported.getNameAsString();
            }
        }
        if (Arrays.asList("String", "Integer", "Long", "Boolean", "Double", "Object").contains(name)) {
            return "java.lang." + name;
        }
        if (Arrays.asList("int", "long", "boolean", "double").contains(name)) {
            return normalizeAlias(name);
        }
        return unit.getPackageDeclaration().map(declaration -> declaration.getNameAsString() + ".").orElse("") + name;
    }

    /**
     * 检查中文文档存在并拒绝已明确禁用的占位说明；语义一致性仍须代码审查。
     *
     * @param doc Javadoc 源文本，允许空，空会计为违规
     * @param owner 诊断用成员标识，不允许为空
     * @param errors 累积违规消息集合，不允许为空，直接追加
     */
    private static void requireChineseDoc(String doc, String owner, List<String> errors) {
        if (!Pattern.compile("[\\u4e00-\\u9fff]").matcher(doc).find()
                || doc.contains("相关业务说明") || doc.contains("执行对应业务操作") || doc.contains("参数说明")) {
            errors.add(owner + "：缺少有效中文说明");
        }
    }
}
